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
  .use(restify.queryParser())
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

// ********************** API routes ********************************
server.get( '/:namespace/:collection', function ( req, res, next ) {
  console.log( '[' + new Date().toUTCString() + '] GET ' + _getKey( req.params.namespace, req.params.collection ) );

  storage.zrange( _getKey( req.params.namespace, req.params.collection ), 0, -1, function ( err, result ) {
    if ( err )
      return next( err );

    res.send( 200, { success: { data: result } } );
    return next();
  } );
} );

server.post( '/:namespace/:collection', function ( req, res, next ) {
  var object = req.body || {};

  console.log( '[' + new Date().toUTCString() + '] POST ' + _getKey( req.params.namespace, req.params.collection ) );

  if ( 'object' !== typeof object || _isEmptyObject( object ) ) {
    res.send( 400, { code: 'You must give an object' } );
    return next();
  }

  // get new resource id stored in namespace:collection:_index store
  storage.incr( _getKey( req.params.namespace, req.params.collection, '_index' ), function ( err, result ) {
    object.id = result;
    storage.zadd( _getKey( req.params.namespace, req.params.collection ), object.id, JSON.stringify( object ) );
    io.sockets.in( req.params.namespace ).emit( eventName, {
      method: 'POST',
      token: req.query.token || null,
      collection: req.params.collection,
      data: object
    } );

    res.send( 201, { success: { data: object } } );
    return next();
  } );
} );

server.get( '/:namespace/:collection/:id', function ( req, res, next ) {
  console.log( '[' + new Date().toUTCString() + '] GET ' + _getKey( req.params.namespace, req.params.collection, req.params.id ) );

  // TODO: test id is an int

  storage.zrange( _getKey( req.params.namespace, req.params.collection ), req.params.id - 1 , req.params.id - 1, function ( err, result ) {
    if ( err )
      return next( err );

    if ( !result )
      return res.send( 404, { code: 'Resource not found' } );

    res.send( 200, { success: { data: result } } );
    return next();
  } );
} );

server.put( '/:namespace/:collection/:id', function ( req, res, next ) {
  var object = req.body || {};

  if ( 'object' !== typeof object || _isEmptyObject( object ) ) {
    res.send( 400, { code: 'You must give an object' } );
    return next();
  }

  console.log( '[' + new Date().toUTCString() + '] PUT ' + _getKey( req.params.namespace, req.params.collection, req.params.id ) );

  // delete resource from set and re-inset it modified
  _deleteResource( req.params.namespace, req.params.collection, req.params.id, function ( err, result ) {
    storage.zadd( _getKey( req.params.namespace, req.params.collection ), req.params.id, JSON.stringify( object ) );
    io.sockets.in( req.params.namespace ).emit( eventName, {
      method: 'PUT',
      token: req.query.token || null,
      collection: req.params.collection,
      data: object
    } );

    res.send( 200, { success: { data: object } } );
    return next();
  } );
} )

server.del( '/:namespace/:collection/:id', function ( req, res, next ) {

  console.log( '[' + new Date().toUTCString() + '] DELETE ' + _getKey( req.params.namespace, req.params.collection, req.params.id ) );

  storage.zrange( _getKey( req.params.namespace, req.params.collection ), req.params.id - 1 , req.params.id - 1, function ( err, object ) {
    if ( err )
      return next( err );

    if ( !object )
      return res.send( 404, { code: 'Resource not found' } );

    _deleteResource( req.params.namespace, req.params.collection, req.params.id, function ( err, result ) {
      io.sockets.in( req.params.namespace ).emit( eventName, {
        method: 'DELETE',
        token: req.query.token || null,
        collection: req.params.collection,
        data: req.params.id
      } );
      res.send( 204 );
      return next();
    } );
  } );
} )

// ************************** Mixins ********************************
var _getKey = function ( namespace, collection, id, fn ) {
    return 'undefined' !== typeof id ? [ namespace, collection, id ].join( ':' ) : [ namespace, collection ].join( ':' );
}

var _deleteResource = function ( namespace, collection, id, fn ) {
  storage.zremrangebyscore( _getKey( namespace, collection ), id, id, function ( err, result ) {
    if ( err )
      return fn( err, result );

    return fn( err, result );
  } );
};

_isEmptyObject = function ( obj ) {
  for ( var property in obj )
    return false;

  return true;
};

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
