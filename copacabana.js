var configuration = require( './conf.js' ),
  restify = require( 'restify' ),
  socketio = require('socket.io'),
  redis = require('redis');

// register our restify copacabana app
var server = restify.createServer( configuration.server );

// start socket.io listening on same restify server port
// TODO: allow different port for socket.io ?
var io = socketio.listen( server );

// create redis client
var storage = redis.createClient( configuration.storage );

// use some handy restify plugins
server
  .use(restify.fullResponse())
  .use(restify.bodyParser({ mapParams: false }))
  .use(restify.jsonp())
  .use(restify.gzipResponse())

var eventName = configuration.events.name;

// copacabana running debug message
server.listen( configuration.server.port, function () {
    console.log('%s listening at %s', server.name, server.url)
} );

// copacabana api welcome page
server.get( '/', function ( req, res ) {
  res.writeHead( 200 );
  res.end( 'Hello Copacabana !' );
  io.sockets.emit( eventName, { hello: 'main page' } );
} );

// GET resources collection
server.get( '/:namespace/:collection', function ( req, res, next ) {
  var key = [ req.params.namespace, req.params.collection ].join( ':' );

  console.log( '[' + new Date().toUTCString() + '] GET ' + key );

  storage.zrange( key, 0, -1, function ( err, result ) {
    if ( err )
      return next( err );

    res.send( 200, { success: { data: result } } );
  } );
} );

// POST create new resource inside new or existing collection
server.post( '/:namespace/:collection', function ( req, res, next ) {
  var key = [ req.params.namespace, req.params.collection ].join( ':' ),
    object = req.body || {};

  console.log( '[' + new Date().toUTCString() + '] POST ' + key );

  // TODO: test object not empty

  storage.zcard( key, function ( err, result ) {
    if ( err )
      return next( err );

    object.id = ++result;

    storage.zadd( key, object.id, JSON.stringify( object ) );
    io.sockets.emit( eventName, { method: 'POST', data: object } );

    res.send( 201, { success: { data: object } } );
    return next();
  } );
} );

server.put( '/:namespace/:collection/:id', function ( req, res, next ) {
  var key = [ req.params.namespace, req.params.collection ].join( ':' ),
    object = req.body || {};

  // TODO: test object not empty

  console.log( '[' + new Date().toUTCString() + '] PUT ' + [ key, req.params.id ].join( ':' ) );

  storage.zrange( key, req.params.id - 1 , req.params.id - 1, function ( err, result ) {
    if ( err )
      return next( err );

    if ( !result )
      return res.send( 404, { code: 'Resource not found' } );

    object.id = req.params.id;
    storage.zadd( key, req.params.id, JSON.stringify( object ) );
    io.sockets.emit( eventName, { method: 'PUT', data: object } );

    res.send( 200, { success: { data: object } } );
    return next();
  } );
} )

server.del( '/:namespace/:collection/:id', function ( req, res, next ) {
  var key = [ req.params.namespace, req.params.collection ].join( ':' );

  // TODO: test object not empty

  console.log( '[' + new Date().toUTCString() + '] DELETE ' + [ key, req.params.id ].join( ':' ) );

  storage.zrange( key, req.params.id - 1 , req.params.id - 1, function ( err, result ) {
    if ( err )
      return next( err );

    if ( !result )
      return res.send( 404, { code: 'Resource not found' } );

    object.id = req.params.id;
    storage.zrem( key, req.params.id );
    io.sockets.emit( eventName, { method: 'DELETE', data: result } );

    res.send( 204, { success: { data: result } } );
    return next();
  } );
} )

// Get resource
server.get( '/:namespace/:collection/:id', function ( req, res, next ) {
  var key = [ req.params.namespace, req.params.collection ].join( ':' );

  console.log( '[' + new Date().toUTCString() + '] GET ' + [ key, req.params.id ].join( ':' ) );

  // TODO: test id is an int

  storage.zrange( key, req.params.id - 1 , req.params.id - 1, function ( err, result ) {
    if ( err )
      return next( err );

    if ( !result )
      return res.send( 404, { code: 'Resource not found' } );

    res.send( 200, { success: { data: result } } );
    return next();
  } );
} );

io.sockets.on( 'connection', function ( socket ) {
  socket.emit( eventName, { hello: 'copacabana' } );
} );
