/*global Backbone */
var app = app || {};

var copacabana = 'http://localhost:8080';

(function () {
	'use strict';

	// Todo Collection
	// ---------------

	// The collection of todos is backed by *localStorage* instead of a remote
	// server.
	var TodoList = Backbone.Collection.extend({
		// Reference to this collection's model.
		model: app.Todo,

    url: copacabana + '/app/todo',

		// Save all of the todo items under the `"todos"` namespace.
		// localStorage: new Backbone.LocalStorage('todos-backbone'),

		// Filter down the list of all todo items that are finished.
		completed: function () {
			return this.filter(function (todo) {
				return todo.get('completed');
			});
		},

		// Filter down the list to only todo items that are still not finished.
		remaining: function () {
			return this.without.apply(this, this.completed());
		},

		// We keep the Todos in sequential order, despite being saved by unordered
		// GUID in the database. This generates the next order number for new items.
		nextOrder: function () {
			if (!this.length) {
				return 1;
			}
			return this.last().get('order') + 1;
		},

		// Todos are sorted by their original insertion order.
		comparator: function (todo) {
			return todo.get('order');
		},

    parse: function ( data ) {
      var collection = [];

			for (var i = 0; i < data.length; i++) {
				collection[ i ] = this.model.prototype.parse( $.parseJSON( data[ i ] ) );
			}

			return collection;
		},

    edit: function ( todo ) {
      this.get( todo.id ).set( todo );
    },

    delete: function ( id ) {
      this.get( id ).trigger( "delete" );
      this.remove( this.get( id ) );
    }
	});

	// Create our global collection of **Todos**.
	app.todos = new TodoList();
})();
