# Copacabana

Quick prototyping node+redis+socket API server for javascript applications

## Version

0.0.1

## Licence

MIT Licenced

## Install

Install vendors
  ```
  npm install restify
  npm install socket.io
  npm install redis
  ```

Copy and edit config file
  `cp conf.js.dist conf.js`

Run Copacabana
  `node copacabana.js`

## General usage

Copacabana allows you to manage you backend API + push events for your frontend
javascript apps. It is not designed to be used in production, rather to
prototype fast javascript applications.

### API

Copacabana implements these urls:

`GET /:namespace/:collection`
`POST /:namespace/:collection` + push event

`GET /:namespace/:collection/:id`
`PUT /:namespace/:collection/:id` + push event
`DELETE /:namespace/:collection/:id` + push event

### Socket events