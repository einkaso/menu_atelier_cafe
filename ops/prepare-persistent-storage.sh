#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Uruchom ten skrypt jako root." >&2
  exit 1
fi

install -d -o menuapp -g menuapp -m 0750 \
  /var/lib/banaszek-menu \
  /var/lib/banaszek-menu/uploads \
  /var/lib/banaszek-menu/uploads/products \
  /var/lib/banaszek-menu/uploads/staff-manuals \
  /var/lib/banaszek-menu/uploads/staff-instructions \
  /var/lib/banaszek-menu/uploads/employee-thanks
