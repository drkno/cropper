# Cropper

Automatically crops videos, to remove black bars. Common on videos from some internet sources.

### Installing

```
yarn
# or
npm install
# or
docker pull drkno/cropper:latest
```

Note: there is also a system dependency on ffmpeg.

### Running as a CLI Tool

To print help:

```
node src/main.js --help
node src/main.js detect --help
node src/main.js crop --help

```

Detect crop dimensions:

```
node src/main.js detect <file>
```

Crop file:

```
node src/main.js crop <input file> <output file>
```

### Running as a server

Server mode allows cropper to automatically receive new files from Sonarr and Radarr for cropping.

```
node src/main.js serve
```

Connect the following webhooks to Sonarr and Radarr:

* `/api/1/webhook/sonarr`
* `/api/1/webhook/radarr`
