FROM node:latest

RUN mkdir -p /opt/ffmpeg && \
    cd /opt/ffmpeg && \
    curl -L https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz --output ffmpeg.tar.xz && \
    tar --strip-components=1 -xf ffmpeg.tar.xz && \
    ln -s /opt/ffmpeg/bin/ffmpeg /usr/bin/ffmpeg && \
    ln -s /opt/ffmpeg/bin/ffprobe /usr/bin/ffprobe && \
    rm ffmpeg.tar.xz

COPY ./ /opt/server

RUN cd /opt/server && npm install

WORKDIR /opt/server
ENTRYPOINT [ "node", "src/main.js", "--ffmpeg-root", "/opt/ffmpeg" ]
EXPOSE 4300
VOLUME [ "/config" ]
CMD [ "serve" ]
