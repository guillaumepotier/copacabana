var configuration = require( './conf/configuration.js' ),
  restify = require( 'restify' ),
  socketio = require('socket.io'),
  redis = require('redis');

// register our restify copacabana app
var server = restify.createServer( configuration.server );

// use some handy restify plugins
server
  .use(restify.fullResponse())
  .use(restify.bodyParser({ mapParams: false }))
  .use(restify.queryParser())
  .use(restify.jsonp())
  .use(restify.gzipResponse());

// allow CORS
server.use( function crossOrigin (req , res, next ) {
  res.header( "Access-Control-Allow-Origin", "*" );
  res.header( "Access-Control-Allow-Headers", "X-Requested-With" );
  return next();
} );

// copacabana running debug message
server.listen( configuration.server.port, function () {
    console.log( '%s listening at %s', server.name, server.url );
} );

// start socket.io listening on same restify server port
// TODO: allow different port for socket.io ?
if ( configuration.socket.enable ) {
  var io = socketio.listen( configuration.socket.port );
  io.set( 'log level', configuration.socket.logLevel );
  console.log( 'io server is now running on port %s..', configuration.socket.port );

  io.sockets.on( 'connection', function ( socket ) {
    socket.emit( configuration.events.name, { hello: 'copacabana' } );

    // join room
    socket.on( 'room', function ( room ) {
      socket.join( room );
      socket.in( room ).emit( configuration.events.name, { hello: room } );
    } );
  } );
}

// create redis client
var storage = redis.createClient( configuration.storage );

// handeling Redis error
storage.on( 'error', function ( err ) {
  console.log( err );
} );

// copacabana api welcome page
server.get( '/', function ( req, res ) {
  _log( req );

  res.writeHead( 200 );
  res.end( 'Hello Copacabana !' );
} );

// ********************** API routes ********************************
server.get( '/:namespace/:collection', function ( req, res, next ) {
  _log( req );

  storage.zrange( _getKey( req ), 0, -1, function ( err, result ) {
    return err ? next( err ) : res.send( 200, result );
  } );
} );

server.post( '/:namespace/:collection', function ( req, res ) {
  var object = req.body || {};

  _log( req );

  if ( 'object' !== typeof object || _isEmptyObject( object ) )
    return res.send( 400, { code: 'You must give an object' } );

  // get new resource id stored in namespace:collection:_index store
  storage.incr( _getKey( req, '_index' ), function ( err, result ) {
    object.id = result;

    storage.zadd( _getKey( req ), object.id, JSON.stringify( object ), function ( err, result ) {
      _pushEvent( object, 'POST', req );

      return res.send( 201, object );
    } );
  } );
} );

server.get( '/:namespace/:collection/:id', function ( req, res, next ) {
  _log( req );

  // TODO: test id is an int

  storage.zrange( _getKey( req ), req.params.id - 1 , req.params.id - 1, function ( err, result ) {
    if ( err )
      return next( err );

    if ( !result )
      return res.send( 404, { code: 'Resource not found' } );

    return res.send( 200, result );
  } );
} );

server.put( '/:namespace/:collection/:id', function ( req, res ) {
  var object = req.body || {};

  _log( req );

  if ( 'object' !== typeof object || _isEmptyObject( object ) )
    return res.send( 400, { code: 'You must give an object' } );

  // delete resource from set and re-inset it modified
  _deleteResource( req, function ( err, result ) {
    storage.zadd( _getKey( req ), req.params.id, JSON.stringify( object ) );

    _pushEvent( object, 'PUT', req );

    return res.send( 200, object );
  } );
} )

server.del( '/:namespace/:collection/:id', function ( req, res, next ) {
  _log( req );

  storage.zrange( _getKey( req ), req.params.id - 1 , req.params.id - 1, function ( err, object ) {
    if ( err )
      return next( err );

    if ( !object )
      return res.send( 404, { code: 'Resource not found' } );

    _deleteResource( req, function ( err, result ) {

      _pushEvent( req.params.id, 'DELETE', req );

      return res.send( 204 );
    } );
  } );
} )

// ************************** Mixins ********************************
var _pushEvent = function ( object, method, req ) {
  if ( !configuration.socket.enable )
    return;

  io.sockets.in( req.params.namespace ).emit( configuration.events.name, {
    method:     method,
    token:      req.query.token || null,
    collection: req.params.collection,
    data:       object
  } );
};

var _log = function ( req ) {
  console.log( '[' + new Date().toUTCString() + '] ' + req.route.method + ' ' + req._url.href );
};

var _getKey = function ( req, suffix ) {
  if ( 'undefined' === typeof req.params.namespace || 'undefined' === typeof req.params.collection )
    return '/' + suffix ? suffix : null;

  return suffix ? [ req.params.namespace, req.params.collection, suffix ].join( ':' ) : [ req.params.namespace, req.params.collection ].join( ':' );
};

var _deleteResource = function ( req, fn ) {
  storage.zremrangebyscore( _getKey( req ), req.params.id, req.params.id, function ( err, result ) {
    return fn( err, result );
  } );
};

_isEmptyObject = function ( obj ) {
  for ( var property in obj )
    return false;

  return true;
};
