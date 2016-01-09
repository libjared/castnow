var http = require('http');
var internalIp = require('internal-ip');
var got = require('got');
var Transcoder = require('stream-transcoder');
var grabOpts = require('../utils/grab-opts');
var debug = require('debug')('castnow:transcode');
var port = 4103;
var chromeSupportedVid = ['h264', 'vp8'];
var chromeSupportedAud = ['aac', 'mp3', 'vorbis', 'pcm_s16le', 'flac'];

function shouldTranscode(ctx) {
  return ctx.options.transcode || ctx.options.tomp4;
}

var transcode = function(ctx, next) {
  if (ctx.mode !== 'launch' || ! shouldTranscode(ctx)) return next();
  if (ctx.options.playlist.length > 1) return next();
  var orgPath = ctx.options.playlist[0].path;

  var ip = ctx.options.myip || internalIp();
  ctx.options.playlist[0] = {
    path: 'http://' + ip + ':' + port,
    type: 'video/mp4'
  };
  ctx.options.disableTimeline = true;
  ctx.options.disableSeek = true;
  http.createServer(function(req, res) {
    var opts = grabOpts(ctx.options, 'ffmpeg-');
    debug('incoming request for path %s', orgPath);
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*'
    });

    var detect = new Transcoder(orgPath)
      .on('metadata', function(meta) {
        var videoCodec, audioCodec;
        for (var i = 0; i < meta.input.streams.length; i++) {
          var strm = meta.input.streams[i];
          if (strm.type === 'video') {
            videoCodec = strm.codec;
          } else if (strm.type === 'audio') {
            audioCodec = strm.codec;
          }
        }
        debug('got input metadata. vid:%s, aud:%s', videoCodec, audioCodec);
        //todo: a/v codecs ok?
        //var s = got(orgPath);
        //s.on('error', function(err) {
        //  debug('got error: %o', err);
        //});
        doTranscode(orgPath, false, false, opts, res);
      })
      .exec();
  }).listen(port);
  debug('started webserver on address %s using port %s', ip, port);
  next();
};

var doTranscode = function(path, bAud, bVid, opts, res) {
  var trans = new Transcoder(path)
    .videoCodec(bVid === true ? 'copy' : 'h264')
    .audioCodec(bAud === true ? 'copy' : 'vorbis')
    .format('matroska')
    .custom('strict', 'experimental')
    .on('finish', function() {
      debug('finished transcoding');
    })
    .on('error', function(err) {
      debug('transcoding error: %o', err);
    });
  for (var key in opts) {
    trans.custom(key, opts[key]);
  }

  var args = trans._compileArguments();
  args = [ '-i', '-' ].concat(args);
  args.push('pipe:1');
  debug('spawning ffmpeg %s', args.join(' '));

  trans.stream().pipe(res);
}

module.exports = transcode;
