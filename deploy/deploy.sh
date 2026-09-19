#!/usr/bin/env bash
# Build on the Pi → side-load into k3s containerd → pin an immutable SHA tag in git → let
# Argo CD reconcile. Same shape as magic-badminton's deploy.sh, minus the database safety
# net: this app is static, so a deploy has nothing to back up and nothing to migrate.
#
# The build runs on the Pi over SSH rather than locally. The Pi is native aarch64, so there
# is no QEMU emulation step and a rebuild is a couple of seconds. The image is never pushed
# to GHCR — it is imported straight into k3s containerd, which is why the Deployment pins
# imagePullPolicy: IfNotPresent.
#
# Usage:  ./deploy/deploy.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=.deployrc
source "$SCRIPT_DIR/.deployrc"
[ -f "$SCRIPT_DIR/.deployrc.local" ] && source "$SCRIPT_DIR/.deployrc.local"

KUSTOMIZATION="$SCRIPT_DIR/k8s/kustomization.yaml"
TAG="${TAG:-sha-$(git -C "$REPO" rev-parse --short=12 HEAD)}"
if ! git -C "$REPO" diff --quiet || ! git -C "$REPO" diff --cached --quiet; then
  TAG="${TAG}-wip$(date +%H%M%S)"
  echo "⚠ working tree is dirty — tagging $TAG (commit first for a reproducible rollback)"
fi
IMAGE="$IMAGE_REPO:$TAG"

echo "▶ Deploy $IMAGE  →  $PI  ($NAMESPACE/$DEPLOYMENT)"

# 1. Ship the build context. The excludes mirror .dockerignore; assets/blender is ~9 MB of
#    source art that never reaches the image.
echo "▶ Syncing build context to $PI..."
ssh "$PI" "mkdir -p $REMOTE_CTX"
rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude 'tests' --exclude 'tools' \
  --exclude 'docs' --exclude 'assets/blender' --exclude '__pycache__' --exclude '.DS_Store' \
  "$REPO/" "$PI:$REMOTE_CTX/"

# 1b. Stamp the build into the service worker. Done on the Pi rather than in the working
#     tree so a deploy never dirties git, and before the build so it lands in the image. The
#     worker's cache name is derived from this, so every deploy ships a byte-different worker
#     and the browser drops the previous build's cache instead of serving it for one more load.
echo "▶ Stamping $TAG into sw.js..."
ssh "$PI" "sed -i 's/__BUILD__/$TAG/' $REMOTE_CTX/sw.js && grep -q \"BUILD = '$TAG'\" $REMOTE_CTX/sw.js"

# 2. Build natively and hand the bytes to k3s.
echo "▶ Building $IMAGE on $PI (native aarch64)..."
ssh "$PI" "cd $REMOTE_CTX && docker build -q -t $IMAGE ."

echo "▶ Importing into k3s containerd..."
ssh "$PI" "docker save $IMAGE | sudo k3s ctr images import -"

# 3. Pin the tag in git so Argo CD deploys it, and so the commit is an auditable record.
echo "▶ Pinning image tag in kustomization.yaml..."
python3 - "$KUSTOMIZATION" "$TAG" <<'PY'
import re, sys
path, tag = sys.argv[1], sys.argv[2]
s = open(path).read()
s2 = re.sub(r'(newTag:\s*)\S+', lambda m: m.group(1) + tag, s, count=1)
assert 'newTag:' in s, "newTag not found in kustomization.yaml"
open(path, 'w').write(s2)
PY
if ! git -C "$REPO" diff --quiet -- "$KUSTOMIZATION"; then
  git -C "$REPO" add "$KUSTOMIZATION"
  git -C "$REPO" commit -q -m "deploy: $TAG"
fi
git -C "$REPO" push -q origin "$GIT_BRANCH"

# 4. Nudge Argo and wait for the rollout.
echo "▶ Syncing Argo CD + waiting for rollout..."
ssh "$PI" bash -s "$ARGOCD_APP" "$NAMESPACE" "$DEPLOYMENT" <<'REMOTE'
set -e
APP="$1"; NS="$2"; DEP="$3"
kubectl -n argocd annotate application "$APP" argocd.argoproj.io/refresh=hard --overwrite >/dev/null 2>&1 || true
sleep 3   # let the repo-server fetch the commit we just pushed
kubectl -n argocd patch application "$APP" --type merge -p '{"operation":{"sync":{}}}' >/dev/null
kubectl -n argocd wait --for=jsonpath='{.status.sync.status}'=Synced application/"$APP" --timeout=120s >/dev/null || true
for i in $(seq 30); do kubectl -n "$NS" get deploy "$DEP" >/dev/null 2>&1 && break; sleep 2; done
kubectl -n "$NS" rollout status deploy "$DEP" --timeout=150s
REMOTE

echo ""
echo "✅ Deployed $IMAGE → $NAMESPACE/$DEPLOYMENT"
echo "   LAN:   http://$HOST"
echo "   Logs:  ssh $PI 'kubectl -n $NAMESPACE logs deploy/$DEPLOYMENT --tail=50 -f'"
