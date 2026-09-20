# syntax=docker/dockerfile:1
#
# Dungeon RO is a no-build-step static site: ES modules straight from src/, Three.js
# vendored, two hero GLBs and the Baphomet boss GLB. So the image is stock nginx plus the files it serves — there is
# nothing to compile, and no Node at runtime.
#
# Built with --platform linux/arm64 for the Pi 5 and side-loaded into k3s containerd, so
# the final stage deliberately has no RUN and needs no QEMU.
FROM nginx:1.27-alpine

# A template, not a conf: the image's entrypoint runs envsubst over /etc/nginx/templates and
# writes conf.d/default.conf, which is how ${DRO_ENV} (lab / prod) gets into /__env.
COPY deploy/nginx.conf /etc/nginx/templates/default.conf.template
COPY index.html style.css gamepad.html manifest.webmanifest sw.js /usr/share/nginx/html/
COPY src/ /usr/share/nginx/html/src/
COPY vendor/ /usr/share/nginx/html/vendor/
# Copy assets/ wholesale and let .dockerignore decide what stays out. Enumerating asset
# folders here has now silently 404'd twice in production: once for assets/monsters when the
# boss GLB was added, once for assets/maps when the painted backdrop was. Both worked fine on
# the dev server, which serves straight from the working tree.
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 80
