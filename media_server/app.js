const NodeMediaServer = require('node-media-server');

const config = {
  rtmp: {
    port: Number(process.env.MEDIA_RTMP_PORT || 19350),
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: Number(process.env.MEDIA_HTTP_PORT || 8001),
    allow_origin: '*',
    mediaroot: './media',
  },
  auth: {
    api: true,
    api_user: process.env.MEDIA_API_USER || 'admin',
    api_pass: process.env.MEDIA_API_PASS || '123456',
  },
  relay: {
    ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
  },
};

const nms = new NodeMediaServer(config);
nms.run();

console.log(
  `[media_server] listening http=${config.http.port} rtmp=${config.rtmp.port}`
);
