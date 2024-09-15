
# User Database Service

This is a federated user login service.

TBD - hooks to other login providers (github/google/etc...)

User information is stored as opaquely as possible.  The User's Display name is visible, but then it's meant to be
visible to everyone anyway.  The users account name is kept in a non-reversible hash, same with the users email, and password.

User email isn't needed for the system other than account recovery; at which point the UI will be asking the user for their email.  The email can be found
by hashing the the provided email, and looking up the account record; at which point data can be updated, or the email, now available from the user, can be
used to send an email confirmation link. The User's email otherwise is not needed, since any notifications they would receive would be from applications 
connecting to services which this works as a go-between for.

This tracks services more transparently.  Services are registered with an `org` which is used as a friendly name for the domain, or a collective name for
many domains; services also register a `domain` which is meant to be a genuine web domain, but there's really nothing yet enforcing that.
Services also provide their `service` name, which can be used to find them... a domain of d3x0r.org might have a `tron-lightcycle` service.  and a `description` for the service
which is to provide more information about the service.


## Running

This started as a possible heroku app; but there's no persistent storage that way. Which is why it evolved to being
able to work against databases instead of container storage, for which both are just as `key-data` stores.


`npm run start`

This starts user database server app...

The following environment variables control execution.

|name|value|
|----|----|
| PORT| port number to serve on defaults to ::0 |
| DSN | database connection to user(may be database or storage container backend |
| SSL_PATH | /etc/letsencrypt/live/... ; where the SSL certificate to serve TLS sould be sourced from reads /fullchain.pem and /privkey.pem |



## Usage


This serve HTML fragments with scripts.  Requests for resources may be done over a single websocket connection (this is experimental).

A Service that wants a user login, first connects to the user database server.  It defines the parameters for its service identity with files
in the current working directory when that process loads.  The service will not immediately exist or be tracked, and certain conditions may make idenifiers
for the service entirely invalid.  

The Service will serve an application to a browser, and part of that application will connect to the login server (with a different protocol?) and
be able to show forms to handle user entry; forms can be controlled with CSS (It is posssible to also serve entirely custom HTML fragments for the login form, and still use the login scripts).
So the browser application will do a login, and on success request a service.

If that service is new, and is pending registration, then the service is contacted, and its registration completes for a first time.  

If the service is already existing, or now exists, then the service is told to `expect(user)` that is it's given a unique identifier for the user for that service, the user name, 
and the service results with a unique identifier. The unique identifier is then sent to the user, with the address of the service to connect to (which may be different than `location`, but probably not).

The browser then makes a connection to the requested service, and sends the unique key the service sent.  All communications should be done over HTTPs.



## User Information

Users end up with a profile of services they have accessed, because services have badges that identify specific rights, and domains have sashes of badges that can be given to users.
The first user to connect to a service is identified as having created the sashes and badges, and gets a sash that has all badges.
Other users than the first get a default sash, with default badges.

When creating an account, the display name is kept clear, the account name is also kept in the clear (for indexing reasons?), the email and password are hashed before being sent to the server.
The server has no choice except to accept and store the hashes.

Sashes can be created by (anyone?), and any badges they have on any sashes they have can be put on the sash, and the sash given to a user.

Users, again, have a default sash, which can be reassigned to a new sash.  The login server itself is supposed to provide a service which 
allows such managment interfaces to work... this is an In-Dev feature, with not enough valid information on usage of the system.

## Service Information

- org : organization the domain and service belongs to
- domain : a website domain sort of name; a valid hostname
- service : a name of a service to request
- description : a long description about the service meant to be read by humans.

- Badges : an array of available badges for the service.  Some services may have many permissions, some just have a few.
- Sashes : Sashes defined for the service.

All of the above information is kept in clear text in storage, and by usage.  This is all meant to be public information anyway,
although it's not nessecarily immdiately obvious, like Badges an Sashes.

## Example code below


These minimal fragments might be things supplied.  Each implementation of a service refines this more, the last pass has a client login.js and a server login.mjs that export just 1 or 2 things each.

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

