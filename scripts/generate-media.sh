#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p storage/videos
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
if [[ ! -f "$FONT" ]];then FONT='/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf';fi
make_demo() {
  local name="$1" title="$2" bg="$3" accent="$4"
  if [[ -s "storage/videos/${name}.mp4" ]];then echo "Reutilizando ${name}.mp4";return;fi
  ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=${bg}:s=640x360:r=24:d=8" \
   -vf "drawbox=x=30:y=30:w=580:h=300:color=${accent}@0.32:t=3,drawbox=x=65:y=68:w=510:h=224:color=white@0.2:t=2,drawtext=fontfile=${FONT}:text='RETRO PLAY':fontsize=22:fontcolor=0x59434a:x=(w-text_w)/2:y=100,drawtext=fontfile=${FONT}:text='${title}':fontsize=29:fontcolor=0x59434a:x=(w-text_w)/2:y=165,drawtext=fontfile=${FONT}:text='Uma obra demonstrativa original':fontsize=15:fontcolor=0x725c63:x=(w-text_w)/2:y=218,drawtext=fontfile=${FONT}:text='CINE \u2022 MEMORIA \u2022 HISTORIAS':fontsize=12:fontcolor=0x725c63:x=(w-text_w)/2:y=262" \
   -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p -movflags +faststart -an "storage/videos/${name}.mp4"
  echo "Gerado ${name}.mp4"
}
make_demo cafe-das-estrelas 'Cafe das Estrelas' '0xf5e4d5' '0xc88d9e'
make_demo cartas-ao-verao 'Cartas ao Verao' '0xf4dce4' '0xd3ad7b'
make_demo a-ultima-sessao 'A Ultima Sessao' '0xe5d9d4' '0xab8a91'
make_demo domingo-em-technicolor 'Domingo em Technicolor' '0xf3e6bf' '0xd6a5ab'

# Gera playlists HLS para reprodução adaptativa nos navegadores com suporte nativo.
for src in storage/videos/*.mp4; do
  name="$(basename "$src" .mp4)"
  mkdir -p "storage/hls/${name}/240p" "storage/hls/${name}/360p"
  for size in 240 360; do
    target="storage/hls/${name}/${size}p"
    if [[ -s "${target}/index.m3u8" ]]; then continue; fi
    ffmpeg -hide_banner -loglevel error -y -i "$src" -vf "scale=-2:${size}" \
      -c:v libx264 -preset ultrafast -crf 30 -pix_fmt yuv420p -an \
      -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_filename "${target}/seg_%03d.ts" "${target}/index.m3u8"
  done
  cat > "storage/hls/${name}/master.m3u8" <<'MANIFEST'
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=240000,RESOLUTION=426x240
240p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=450000,RESOLUTION=640x360
360p/index.m3u8
MANIFEST
done
