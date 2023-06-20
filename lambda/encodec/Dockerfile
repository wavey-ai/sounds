FROM public.ecr.aws/lambda/provided:al2 as builder

RUN yum update -y

RUN yum makecache &&\
yum -y install \
  wget tar xz gzip golang awscli cargo \
  ldconfig pkg-config llvm clang openssl-devel \
  glib2-devel \
  expat-devel \
  librsvg2-devel \
  libpng-devel \
  libjpeg-devel \
  libtiff-devel \
  libexif-devel \
  giflib-devel \
  lcms2-devel \
  libxml2-devel \
  libgsf-devel \
  fftw-devel &&\
yum -y group install "Development Tools"

E
