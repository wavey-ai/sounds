#!/bin/bash

set -e

src=$1
dst=$2
key=$3

WORK_DIR=$(mktemp -d)

cd $WORK_DIR

mkdir out

aws s3 cp "$src" - | ffmpeg -i pipe:0 -q:a 0 -map a -vn -acodec pcm_s16le -ar 48000 -f wav -map_metadata -1 pipe:1 | LD_LIBRARY_PATH=/usr/local/lib /app/soundkit encode | aws s3 cp - $dst/stream/$key/"$key"_stream_96k
aws s3 cp "$src" - | ffmpeg -i pipe:0 -q:a 0 -map a -vn -acodec pcm_s16le -ar 48000 -f wav -map_metadata -1 pipe:1 | audiowaveform --input-format wav --output-format dat -b 8 | aws s3 cp - $dst/av/$key/"$key"_waveform.dat

aws s3 sync $WORK_DIR/out/ $dst/png/$key
