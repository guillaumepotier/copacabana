var configuration = require( './conf.js' ),
  restify = require( 'restify' ),
  socketio = require('socket.io'),
  redis = require('redis');

// register our restify copacabana app
var server = restify.createServer( configuration.server );

// start socket.io listening on same restify server port
// TODO: allow different port for socket.io ?
var io = socketio.listen( server );
io.set( 'log level', configuration.socket.logLevel || 42 );

// create redis client
var storage = redis.createClient( configuration.storage );

// use some handy restify plugins
server
  .use(restify.fullResponse())
  .use(restify.bodyParser({ mapParams: false }))
  .use(restify.jsonp())
  .use(restify.gzipResponse());

var eventName = configuration.events.name;

// copacabana running debug message
server.listen( configuration.server.port, function () {
    console.log( '%s listening at %s', server.name, server.url );
} );

// copacabana api welcome page
server.get( '/', function ( req, res ) {
  res.writeHead( 200 );
  res.end( 'Hello Copacabana !' );
  console.log( '[' + new Date().toUTCString() + '] GET /' );
} );

// GET resources collection
server.get( '/:namespace/:collection', function ( req, res, next ) {
  var key = [ req.params.namespace, req.params.collection ].join( ':' );

  console.log( '[' + new Date().toUTCString() + '] GET ' + key );

  storage.zrange( key, 0, -1, function ( err, result ) {
    if ( err )
      return next( err );

    res.send( 200, { success: { data: result } } );
    return next();
  } );
} );

// POST create new resource inside new or existing collection
server.post( '/:namespace/:collection', function ( req, res, next ) {
  var key = [ req.params.namespace, req.params.collection ].join( ':' ),
    object = req.body || {};

  console.log( '[' + new Date().toUTCString() + '] POST ' + key );

  // TODO: test object not empty

  storage.zrange( key, -1, -1, function ( err, result ) {
    var lastId = 0;

    try {
      lastId = JSON.parse( result )[ 'id' ];
    } catch ( err ) {}

    object.id = lastId + 1;

    storage.zadd( key, object.id, JSON.stringify( object ) );
    io.sockets.in( req.params.namespace ).emit( eventName, { method: 'POST', collection: req.params.collection, data: object } );

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

    object.id = Number( req.params.id );
    storage.zadd( key, req.params.id, JSON.stringify( object ) );
    io.sockets.in( req.params.namespace ).emit( eventName, { method: 'PUT', collection: req.params.collection, data: object } );

    res.send( 200, { success: { data: object } } );
    return next();
  } );
} )

server.del( '/:namespace/:collection/:id', function ( req, res, next ) {
  var key = [ req.params.namespace, req.params.collection ].join( ':' ),
    object = req.body || {};

  // TODO: test object not empty

  console.log( '[' + new Date().toUTCString() + '] DELETE ' + [ key, req.params.id ].join( ':' ) );

  storage.zrange( key, req.params.id - 1 , req.params.id - 1, function ( err, result ) {
    if ( err )
      return next( err );

    if ( !result )
      return res.send( 404, { code: 'Resource not found' } );

    object.id = req.params.id;
    storage.zremrangebyscore( key, req.params.id, req.params.id, function ( err, result ) {
      if ( err )
        return next( err );

      io.sockets.in( req.params.namespace ).emit( eventName, { method: 'DELETE', collection: req.params.collection, data: object.id } );

      res.send( 204 );
      return next();
    } );
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

  // join room
  socket.on( 'room', function ( room ) {
    socket.join( room );
    socket.in( room ).emit( eventName, { hello: room } );
  } );
} );

// handeling Redis error
storage.on( 'error', function ( err ) {
  console.log( err );
} );
