FROM node:latest

RUN mkdir -p /opt/ffmpeg && \
    cd /opt/ffmpeg && \
    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz --output ffmpeg.tar.xz && \
    tar --strip-components=1 -xf ffmpeg.tar.xz && \
    ln -s /opt/ffmpeg/ffmpeg /usr/bin/ffmpeg && \
    ln -s /opt/ffmpeg/ffprobe /usr/bin/ffprobe && \
    rm ffmpeg.tar.xz

COPY ./ /opt/server

RUN cd /opt/server && npm install

WORKDIR /opt/server
ENTRYPOINT [ "node", "src/main.js", "--ffmpeg-root", "/opt/ffmpeg" ]
EXPOSE 4300
VOLUME [ "/config" ]
CMD [ "serve" ]
