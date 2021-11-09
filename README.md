
# User Database Service

`npm run start`

This starts a heroku app...

## Heroku app


## Usage


### Service

A service which wants to have logins, would use the `@d3x0r/user-database-remote` package.

``` js

import {UserDbRemote} from "@d3x0r/user-database-remote";
UserDbRemote.import = Import;      
UserDbRemote.on( "expect", expect );
  
function Import(a) { return import(a)} 
let  loginServer;
openLoginServer(); // must only be called once...

function openLoginServer() {
	loginServer = null;
	setTimeout( ()=>initServer( loginServer = UserDbRemote.open() ), 5000 );

	function initServer( loginServer ) {
		loginServer.on( "close", openLoginServer );
	}
}


const connections = new Map();

class User extends StoredObject {
	name=null;
	
	constructor() {
	}
	set( uid, name ) {
		this.store();
	}
}

function expect( msg ) {
	console.log( "Told to expect a user: does this result with my own unique ID?", msg );

	const id = sack.Id();
	const user = msg;
	connections.set( id, user );
	// lookup my own user ? Prepare with right object?
	// connections.set( msg.something, msg ) ;	
	console.log( "expected user:", id );
	return id;
}


```

### Served Client

The client side also needs some support code for logins.

THis method has the issue that it creates a new login form every time it connects, and potentially leaves said login form linked into the display HTML graph; although not visible.


``` js
const domain = "d3x0r.org"; // some application domain we want to log into.
const service = "flatland"; // some service within the domain we'd like to talk to.

import {popups} from "@d3x0r/popups/popups.mjs" // some UI utility... this sample uses this.

//import {connection,Alert,openSocket} from "/login/webSocketClient.js";
const wsc = await import( "https://d3x0r.org:8089/ui/login/webSocketClient.js" ).then( (module)=>{
	beginLogin( module.openSocket, module.connection );
	return module;
} ).catch( async ()=>{
	/*
	const alternative = await import( altURL ).then( (module)=>{
		beginLogin( module.openSocket, module.connection );
		return module;
	}
	return alternative;
	*/
} );


function beginLogin( openSocket, connection ) {
	openSocket = openSocket || wsc.openSocket;
	connection = connection || wsc.connection;
	openSocket().then( (socket)=>{
		console.log( "Open socket finally happened?", socket );
		connection.loginForm = popups.makeLoginForm( (conn)=>{
			// this is 'login success'.  This is called once a successful account token has been established.
			
			// the first callback is the connection that the popup form is going to be using
			// connection looks like a websocket, with extra methods.
				//console.log( "login socket initialized...", conn );
			// request service and domain
        			conn.request( domain, service ).then( (token)=>{
					// this token is an object containing address and unique identifier (expect() result)
					console.log( "flatland request:", token );
				        l.login = token; // this is 'connection' also.


					// connect to the service...
					openGameSocket( token.svc.key );

					// the default login form doesn't hide itself on completion; just its content
					connection.loginForm.hide();
				} );
			}
			, {wsLoginClient:connection ,
				useForm: "https://d3x0r.org:8089/ui/login/loginForm.html",
				parent: app || document.getElementById( "app" ) || null
			} );
		return socket;
	} );

}

```

