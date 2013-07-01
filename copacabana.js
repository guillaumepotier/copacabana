var configuration = require( './conf/configuration.js' ),
  restify = require( 'restify' ),
  socketio = require('socket.io'),
  redis = require('redis');

// register our restify copacabana app
var server = restify.createServer( configuration.server );

// copacabana running debug message
server.listen( configuration.server.port, function () {
    console.log( '%s listening at %s', server.name, server.url );
} );

// start socket.io listening on same restify server port
// TODO: allow different port for socket.io ?
if ( configuration.socket.enable ) {
  var io = socketio.listen( server );
  io.set( 'log level', configuration.socket.logLevel || 42 );
  console.log( 'io server is now running..' );

  io.sockets.on( 'connection', function ( socket ) {
    socket.emit( eventName, { hello: 'copacabana' } );

    // join room
    socket.on( 'room', function ( room ) {
      socket.join( room );
      socket.in( room ).emit( eventName, { hello: room } );
    } );
  } );
}

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

// copacabana api welcome page
server.get( '/', function ( req, res ) {
  res.writeHead( 200 );
  res.end( 'Hello Copacabana !' );
  _log( req );
} );

// ********************** API routes ********************************
server.get( '/:namespace/:collection', function ( req, res, next ) {

  _log( req );

  storage.zrange( _getKey( req ), 0, -1, function ( err, result ) {
    if ( err )
      return next( err );

    res.send( 200, result );
    return next();
  } );
} );

server.post( '/:namespace/:collection', function ( req, res, next ) {
  var object = req.body || {};

  _log( req );

  if ( 'object' !== typeof object || _isEmptyObject( object ) ) {
    res.send( 400, { code: 'You must give an object' } );
    return next();
  }

  // get new resource id stored in namespace:collection:_index store
  storage.incr( _getKey( req, '_index' ), function ( err, result ) {
    object.id = result;
    storage.zadd( _getKey( req ), object.id, JSON.stringify( object ) );

    _pushEvent( object, 'POST', req );

    res.send( 201, object );
    return next();
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

    res.send( 200, result );
    return next();
  } );
} );

server.put( '/:namespace/:collection/:id', function ( req, res, next ) {
  var object = req.body || {};

  if ( 'object' !== typeof object || _isEmptyObject( object ) ) {
    res.send( 400, { code: 'You must give an object' } );
    return next();
  }

  _log( req );

  // delete resource from set and re-inset it modified
  _deleteResource( req, function ( err, result ) {
    storage.zadd( _getKey( req ), req.params.id, JSON.stringify( object ) );

    _pushEvent( object, 'PUT', req );

    res.send( 200, object );
    return next();
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

      res.send( 204 );
      return next();
    } );
  } );
} )

// ************************** Mixins ********************************
var _pushEvent = function ( object, method, req ) {
  if ( !configuration.socket.enable )
    return;

  io.sockets.in( req.params.namespace ).emit( eventName, {
    method: method,
    token: req.query.token || null,
    collection: req.params.collection,
    data: object
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

// handeling Redis error
storage.on( 'error', function ( err ) {
  console.log( err );
} );
