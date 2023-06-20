#!/bin/bash

set -e

src=$1
dst=$2

aws s3 cp $src - | pngquant --posterize 4 --quality 20-20 - | aws s3 cp - $dst
