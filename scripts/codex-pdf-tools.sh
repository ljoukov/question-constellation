#!/usr/bin/env bash
set -euo pipefail

command_name="${1:-help}"
shift || true

usage() {
  cat <<'USAGE'
Usage:
  bash pdf-tools.sh pdf-info --pdf=question-paper.pdf --output=qp-info.txt
  bash pdf-tools.sh pdftotext-pages --pdf=question-paper.pdf --pages=2-4 --output=qp-pages-2-4.txt
  bash pdf-tools.sh render-pages --pdf=question-paper.pdf --pages=1-4 --dpi=180 --output-dir=qp-pages
  bash pdf-tools.sh extract-embedded-images --pdf=question-paper.pdf --output-dir=qp-images --manifest=qp-images.txt
  bash pdf-tools.sh contact-sheet --glob='qp-pages/*.png' --output=qp-contact.jpg --thumb=220x310 --columns=4
  bash pdf-tools.sh crop --image=qp-pages/page-03.png --crop=170,400,950,1100 --output=q01-crop.png
  bash pdf-tools.sh line-count --image=qp-pages/page-03.png --crop=170,400,950,1100 --output=q01-lines.json
USAGE
}

arg() {
  local name="$1"
  local default="${2:-}"
  shift 2 || true
  local item
  for item in "$@"; do
    case "$item" in
      "--${name}="*) printf '%s\n' "${item#*=}"; return 0 ;;
    esac
  done
  printf '%s\n' "$default"
}

require_arg() {
  local name="$1"
  local value
  value="$(arg "$name" "" "$@")"
  if [[ -z "$value" ]]; then
    echo "Pass --${name}=..." >&2
    exit 1
  fi
  printf '%s\n' "$value"
}

page_count() {
  pdfinfo "$1" | awk '/^Pages:/ { print $2; exit }'
}

expand_pages() {
  local pages="$1"
  local total="${2:-}"
  if [[ -z "$pages" ]]; then
    seq 1 "$total"
    return 0
  fi
  local part start end page
  IFS=',' read -ra parts <<< "$pages"
  for part in "${parts[@]}"; do
    part="${part//[[:space:]]/}"
    [[ -z "$part" ]] && continue
    if [[ "$part" =~ ^([0-9]+)-([0-9]+)$ ]]; then
      start="${BASH_REMATCH[1]}"
      end="${BASH_REMATCH[2]}"
      seq "$start" "$end"
    else
      printf '%s\n' "$part"
    fi
  done | awk -v total="$total" '$0 ~ /^[0-9]+$/ && $0 > 0 && (total == "" || $0 <= total) && !seen[$0]++'
}

case "$command_name" in
  help|--help|-h)
    usage
    ;;

  pdf-info)
    pdf="$(require_arg pdf "$@")"
    output="$(arg output "" "$@")"
    if [[ -n "$output" ]]; then
      mkdir -p "$(dirname "$output")"
      pdfinfo "$pdf" > "$output"
    else
      pdfinfo "$pdf"
    fi
    ;;

  pdftotext-pages)
    pdf="$(require_arg pdf "$@")"
    output="$(require_arg output "$@")"
    pages="$(arg pages "" "$@")"
    mkdir -p "$(dirname "$output")"
    if [[ -n "$pages" ]]; then
      mapfile -t expanded < <(expand_pages "$pages" "$(page_count "$pdf")")
      first="${expanded[0]}"
      last="${expanded[${#expanded[@]}-1]}"
      pdftotext -layout -f "$first" -l "$last" "$pdf" "$output"
    else
      pdftotext -layout "$pdf" "$output"
    fi
    printf '{"pdf":"%s","output":"%s","chars":%s}\n' "$pdf" "$output" "$(wc -c < "$output")"
    ;;

  render-pages)
    pdf="$(require_arg pdf "$@")"
    output_dir="$(require_arg output-dir "$@")"
    pages="$(arg pages "" "$@")"
    dpi="$(arg dpi 180 "$@")"
    prefix="$(arg prefix page "$@")"
    mkdir -p "$output_dir"
    mapfile -t expanded < <(expand_pages "$pages" "$(page_count "$pdf")")
    for page in "${expanded[@]}"; do
      page_padded="$(printf '%02d' "$page")"
      output_prefix="${output_dir}/${prefix}-${page_padded}"
      pdftoppm -singlefile -png -r "$dpi" -f "$page" -l "$page" "$pdf" "$output_prefix"
    done
    printf '{"pdf":"%s","outputDir":"%s","pages":%s}\n' "$pdf" "$output_dir" "${#expanded[@]}"
    ;;

  extract-embedded-images)
    pdf="$(require_arg pdf "$@")"
    output_dir="$(require_arg output-dir "$@")"
    manifest="$(arg manifest "${output_dir}/embedded-images.txt" "$@")"
    mkdir -p "$output_dir"
    pdfimages -list "$pdf" > "$manifest"
    pdfimages -png "$pdf" "${output_dir}/embedded"
    find "$output_dir" -maxdepth 1 -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.ppm' \) | sort
    ;;

  contact-sheet)
    pattern="$(require_arg glob "$@")"
    output="$(require_arg output "$@")"
    thumb="$(arg thumb 220x310 "$@")"
    columns="$(arg columns 4 "$@")"
    mkdir -p "$(dirname "$output")"
    montage $pattern -thumbnail "$thumb" -tile "${columns}x" -geometry +4+4 "$output"
    printf '{"pattern":"%s","output":"%s"}\n' "$pattern" "$output"
    ;;

  crop)
    image="$(require_arg image "$@")"
    crop="$(require_arg crop "$@")"
    output="$(require_arg output "$@")"
    IFS=',' read -r x y width height <<< "$crop"
    mkdir -p "$(dirname "$output")"
    convert "$image" -crop "${width}x${height}+${x}+${y}" "$output"
    printf '{"image":"%s","output":"%s","crop":"%s"}\n' "$image" "$output" "$crop"
    ;;

  line-count)
    image="$(require_arg image "$@")"
    crop="$(require_arg crop "$@")"
    output="$(require_arg output "$@")"
    threshold="$(arg threshold 180 "$@")"
    min_run_ratio="$(arg min-run-ratio 0.4 "$@")"
    min_dark_ratio="$(arg min-dark-ratio 0.08 "$@")"
    IFS=',' read -r x y width height <<< "$crop"
    pgm="${output%.*}.pgm"
    convert "$image" -crop "${width}x${height}+${x}+${y}" -colorspace Gray -compress none "$pgm"
    node helper.mjs detect-lines-from-pgm --pgm="$pgm" --threshold="$threshold" --min-run-ratio="$min_run_ratio" --min-dark-ratio="$min_dark_ratio" --output="$output"
    ;;

  *)
    echo "Unknown command: $command_name" >&2
    usage >&2
    exit 1
    ;;
esac
