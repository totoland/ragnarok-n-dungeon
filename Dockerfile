# syntax=docker/dockerfile:1
#
# Dungeon RO is a no-build-step static site: ES modules straight from src/, Three.js
# vendored, two hero GLBs. So the image is stock nginx plus the files it serves — there is
# nothing to compile, and no Node at runtime.
#
# Built with --platform linux/arm64 for the Pi 5 and side-loaded into k3s containerd, so
# the final stage deliberately has no RUN and needs no QEMU.
FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html style.css /usr/share/nginx/html/
COPY src/ /usr/share/nginx/html/src/
COPY vendor/ /usr/share/nginx/html/vendor/
COPY assets/heroes/ /usr/share/nginx/html/assets/heroes/

EXPOSE 80
