#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Uruchom ten skrypt jako root." >&2
  exit 1
fi

release_directory="${1:-/opt/banaszek-menu-next}"
source_directory="${release_directory}/deployment-assets/product-images"
target_directory="/var/lib/banaszek-menu/uploads/products"

if [[ ! -d "${source_directory}" ]]; then
  echo "Brak katalogu zdjęć do instalacji: ${source_directory}" >&2
  exit 1
fi

install -d -o menuapp -g menuapp -m 0750 "${target_directory}"

shopt -s nullglob
product_images=("${source_directory}"/*)
if [[ "${#product_images[@]}" -eq 0 ]]; then
  echo "Brak przygotowanych zdjęć produktów w ${source_directory}." >&2
  exit 1
fi
for product_image in "${product_images[@]}"; do
  filename="$(basename "${product_image}")"
  if [[ ! "${filename}" =~ ^[0-9]+-[a-f0-9]{16}\.(jpg|png|webp|avif)$ ]]; then
    echo "Pominięto plik o nieprawidłowej nazwie: ${filename}" >&2
    continue
  fi
  install -o menuapp -g menuapp -m 0640 "${product_image}" "${target_directory}/${filename}"
done
