import { JSOX } from '../../../../../../../../../node_modules/jsox/lib/jsox.mjs';
import { SaltyRNG } from '../../../../../../../../../node_modules/@d3x0r/srg/salty_random_generator.js';

function getStorage( send ) {
const storageRequests = [];

const config = {run:{ devkey:null,
		clientKey : null,
		sessionKey : null
			} };


const localStorage = {
	getItem(key) {
		if( config.run[key] ) {
			return Promise.resolve(config.run[key]);
		}
		return new Promise( (res,rej)=>{
			storageRequests.push( {res:res,key:key} );
			send( {op:"getItem", key:key} );
		} );
	}
	, setItem(key,val) {
		config.run[key] = val;
		send( {op:"setItem", key:key, val:val} );
	}
	, respond( val ) {
		const dis = storageRequests.shift();
		config.run[dis.key] = val;
		dis.res(val);
	}
};
	return { config:config,
            	localStorage:localStorage }
}

const generator = SaltyRNG.id;
const regenerator = SaltyRNG.id;
const short_generator = SaltyRNG.Id();

const JSON = JSOX;

const connections = new Map();

var wsAuth;

var loginCallback;
var loginTimer = null;

var stage = 0;
var pendingServiceRequest = null;
var currentProtocol = "";
var requestTimer = null;
var timeoutAuth;

function makeProtocol( client ) {

const storage = getStorage( send );
const localStorage = storage.localStorage;
const config = storage.config;

function send(msg) {
    client.postMessage( msg );
}

function handleMessage(e,msg) {
	//const msg = e.data;
	if( "string" === typeof msg ) {
		return wsAuth.send( msg );
	}
        //console.log( "Worker received from main:", msg );
        if( msg.op === "connect" ) {
        	const connection = makeSocket();
		protocol_.connectionId = connection.id;

		e.source.postMessage( {op:"connecting", id:connection.id } );

		if( !config.run.devkey )
			localStorage.getItem( "devkey" ).then( val=>{
				if( !val ) {
					config.run.devkey = generator();
					localStorage.setItem( "devkey", config.run.devkey );
				}
				config.run.devkey = val;
				localStorage.getItem( "clientKey" ).then( val=>{ config.run.devkey = val;
					localStorage.getItem( "sessionKey" )
						.then( val=>config.run.devkey = val )
						.then( finishSocket );
				} );
			} );
		else
			localStorage.getItem( "clientKey" ).then( val=>{ config.run.devkey = val;
				localStorage.getItem( "sessionKey" ).then( val=>config.run.devkey = val ).then( finishSocket );
			} );

		function finishSocket() {
			protocol.connectionId = connection.id;
			connection.ws = protocol.connect( msg.protocol, msg.address, 
				(msg)=>{
				e.source.postMessage({op:"a",id:connection.id,msg:msg });
			} );
		}
	}else if( msg.op === "connected" ) {
		const socket = connections.get( msg.id );
		//socket.ws.send( msg.msg );
	}else if( msg.op === "send" ) {
		const socket = connections.get( msg.id );
		if( socket ) socket.ws.send( msg.msg );
		else throw new Error( "Socket is closed:"+msg.id );
        }else if( msg.op === "login" ) {
        	protocol.login( msg.user,msg.pass,(status)=>{
                        send( { op:"login", status:status } );
                } );
        }else if( msg.op === "serviceReply" ) {
		const newSock = makeSocket();
		protocol_.connectionId = newSock.id;
				        		
		newSock.ws = openSocket( msg.service, 2, (msg,ws)=>{
				if( msg.op === "status" ) { 
					// op.status
					if( ws ){
			                        send( {op:'a',id:ws.id,msg:msg} );
						//send( {op:'a',id:ws.id,msg:msg} );
                                        }
					return;
				}
				else if( msg === true ) {
					//console.log( "This should be a blank service: Auth was?", msg,ws );
			                send( {op:"connecting", id:ws.id} );
					//send( {op:"connecting", id:ws.id} );
				}
                                else if( msg.op === "disconnect" ) {
                                    	send( msg );
                                }
				else console.log( "Unhandled connect message:", msg );
				//console.log( "Socket reply(service side)", ws, msg, msg_ );
			}, msg.id, "wss://"+msg.address+":"+msg.port+"/" );
        }else {
		console.log( "Unhandled message:", msg );
		return false; 
	}
	return true;
}





const protocol = {
    localStorage: localStorage,
	connect : connect,
	login : login,
	connectTo : connectTo,
	request : requestService,
	handleMessage : handleMessage,
	serviceLocal : null,
	connected : false,
	loggedIn : false,
	doneWithAuth : false,
	username : null,
	userkey : null,
	connectionId : null,
	resourceReply : null,
	requestKey(ident,cb) { wsAuth.requestKey( ident,cb );},
	closeAuth() { wsAuth.close(1000, "done"); },
        send(sock,msg){
            	if( "object" === typeof msg ) msg = JSOX.stringify( msg );
        	const socket = connections.get( sock );
                if( socket ) socket.ws.send( msg );
        },
	relogin( service, cb ) { 
		wsAuth.relogin( (user,message,reset)=>{
			if( user === false ) {
				cb( false, message );
				//pendingServiceRequest = false;
			} else {
			protocol.loggedIn = true;
			protocol.username = reset;
			protocol.userid = message;

			requestService(service, null, null, (msg,data)=>{
				if( !msg ) {
					cb( false, data );
					return;
				} else {
					cb( msg, data );
				}
				//cb();
			});
			}
		} ); 
	},
	createUser(a,b,c,d,e ) {
		wsAuth.createUser(a,b,c,d,e);
	}
};
const protocol_ = protocol; // this is a duplicate because openSocket has parameter 'protocol'


function connect(addr,proto, cb) {
	return openSocket( proto, 0, cb, null, addr );
}


function makeSocket( ) {
	const sock = {
			ws : null, // wait until we get a config to actually something...
			id : short_generator()
		};
	connections.set( sock.id, sock );
	return sock;
}


function openSocket( protocol, _stage, cb, passkey, peer ) {
	//var https_redirect = null;
	var mykey = { key:generator(), step:0 };
	if( !_stage )
		stage = 0;
	var connected = false;
	var ws;
	if( stage && !redirect )
		console.log( "Need to re-request service....", protocol, stage);
	//connections++;
	cb( { op:"status", status:"connecting..."+stage + " " + protocol } );
	try {
		ws = new WebSocket( (_stage == 0?peer:redirect)
			, protocol
			, _stage>0?{
				perMessageDeflate: false,
				//ca : config.caRoot
			}:null
		);
		//console.log( "New connection ID:", protocol_.connectionId );
		
		ws.id = protocol_.connectionId;
		protocol_.connectionId = null;
		redirect = null;

		if( _stage === 1 ) {
			wsAuth = ws;
		} else if( _stage > 1 ) {
			cb( true, ws );
		}
	} catch( err ) {
		console.log( "CONNECTION ERROR?", err );
		return null;
	}
        //console.log( "Got websocket:", ws, Object.getPrototypeOf( ws ) );

	function startup() {
		localStorage.getItem( "clientKey" ).then( key=>{
			if( !key && _stage === 0 ) {
				console.log( "need key..." );
				ws.send( '{op:"getClientKey"}' );
			} else {
				if( _stage == 0 ) {
					//console.log( "request auth0" );
					ws.send( "AUTH" );
					timeoutAuth = setTimeout( ()=>{
				        	cb( { op:"status", status: " AUTH not responding..." }, ws);
						console.log( "Auth timed out..." );
					}, 5000 );
				} else {
					ws.send( passkey );
					//ws.send( `{op:"hello"}` );
				}
			}
		} );
	}

	ws.onopen = function() {
			connected = true;
			if( _stage == 0 )
				cb( { op:"status", status: "Opened...." }, ws);
			else if( _stage == 1 ) {
				cb( { op:"status", status: "Ready to login..." }, ws);
				send( {op:'a', id:ws.id, msg:{op:"connected"} } ); // just forward this.
			} else
				cb( { op:"status", status: "Connecting..." }, ws);

		// Web Socket is connected. You can send data by send() method.
		//ws.send("message to send");
		//console.log( "key is", mykey );
		//console.log( "keys:", key, skey );
		ws.send( mykey.key );
		ws.send = ((orig)=>(msg)=>{ 
			if( ws.readyState !== 1 ) return; // protect sending closed
			if( "object" === typeof msg )
				orig( JSOX.stringify(msg ) );
			else
				orig( msg );
		})(ws.send.bind(ws));
		startup();
	};
	ws.onmessage = function (evt) {
		//var tmpmsg = u8xor( evt.data, myreadkey );
		var msg = JSON.parse( evt.data );
		if( !msg ) return;
		//_debug && 
		//console.log( "got message:", protocol, _stage, msg );
		if( _stage > 0 ) {
			//console.log( "Forwarding extension message ");
			if( _stage < 3 ) {
				if( msg.op === "addMethod" ) {
					stage = _stage;
				}
				if( msg.op === 'GET' ) {
					if( protocol_.resourceReply )
						protocol_.resourceReply( client, msg );
					return;
				}
				/*
				if( msg.op === "serviceReply" ) { // really needs to go back to protocol client code...
				
					if( !msg ) {
						cb( false, data );
						return;
					}
					// {op:"serviceReply", id:"B3D2Z$EvTox_9Pf$VAot8i6wC$JZPV0rHlW8zWAjIHQ=",port:32678,address:"198.143.191.26",service:"KCHATAdmin"}
					//redirect = "wss://"+msg.address+":"+msg.port+"/";
					//https_redirect = "https://"+msg.address+":"+msg.port+"/";
					currentProtocol = msg.service;
					secureChannel = true;

					const newSock = makeSocket();
					
					//protocol_.connectionId = newSock.id;
				         
					newSock.ws = openSocket( msg.service, 3, serviceConnected, msg.id, "wss://"+msg.address+":"+msg.port+"/" );
					
					function serviceConnected( data ) {
						
						console.log( "Service connection:", data );
					}
				}
				*/
			}
			send( {op:'a', id:ws.id, msg:msg } ); // just forward this.
		} else if( _stage == 0 ) {
			//console.log( "Layer0 message", msg );
			if( msg.op === "setClientKey" ) {
				//console.log( "Got key:", msg );
				config.run.clientKey = msg.key;
				localStorage.setItem( "clientKey", msg.key );
				startup();
				return;
			}
		}
	};
	ws.onerror = function(err) {
		console.log( "Can I get anything from err?", err );
		if( !err.target.url.includes( "chatment.com" ) ) ;
	};
	ws.onclose = doClose;
	function doClose(status) {
		if( ws === wsAuth ) wsAuth = null;
		if( protocol.serviceLocal ) {
                    console.log( "protocol ui socket also?", protocol.serviceLocal );
			if( protocol.serviceLocal.uiSocket === ws.socket ) {
                            	console.log( "clearing ui Socket so it doesn't send?" );
				protocol.serviceLocal.uiSocket = null;
                        }
		}
		connections.delete( ws.id );
		console.log(" Connection closed...", status, ws.id );
		if( status.code == 1000 ) return;

		if( !connected ) {
			//console.log( "Aborted WEBSOCKET!", step, status.code, status.reason )
			cb( { op:"status", status:"connection failing..." }, ws);
			setTimeout( ()=>{openSocket(protocol,_stage,cb,null,peer );}, 5000 );
			return;
	        }
		connected = false;
		
        	if( ( _stage == 0 || _stage == 2 ) && pendingServiceRequest ) {
			pendingServiceRequest(null);
			if( requestTimer ) { clearTimeout( requestTimer ); requestTimer = null; }
			pendingServiceRequest = null;
	        }
		//console.log( "CLOSED WEBSOCKET!", protocol, stage, status )
		if( redirect && _stage >= 1 ) {
			if( _stage > 1 )
				console.log( "Cannot auto-reconnect; need to re-request service" );
			else
				openSocket( currentProtocol, stage = ++_stage, cb, null, peer );
			redirect = null;
		} else {
			// reconnect this same protocol...
			protocol_.loggedIn = false;
			protocol_.doneWithAuth = false;
		        cb( { op:"status", status: "Disconnected... waiting a moment to reconnect..." }, ws);
			cb( { op:"disconnect", id:ws.id }, ws );

		}
		// websocket is closed.
	}	return ws;
}

function abortLogin( ) {
	if( loginCallback ) {
		loginCallback( false, "Timeout" );
		loginCallback = null;
	}
}

function connectTo( addr, service, sid, cb ) {
	openSocket( service, 3, cb, sid, addr );
}

function login(user,pass, cb) {
	if( !loginCallback ) {
		if( stage !== 1 ) {
			if( stage > 1 )
				console.log( "already logged in?" );
			console.log( "Login is not ready yet..." );
			cb( false, "Login is not ready yet..." );
			return;
		}
		loginCallback = cb;
		if( wsAuth && stage == 1 ) {
			//console.log( "Send login to auth0" );
			wsAuth.login( user, pass, (a,b,c)=>{
				clearTimeout( loginTimer ) ;
				loginCallback=null;
				cb(a,b,c,wsAuth); 
			} );
			loginTimer = setTimeout( abortLogin, 5000 );
		}
	} else {
		console.log( "login already in progress" );
	}
}

function timeoutRequest() {
	if( pendingServiceRequest ) {
		pendingServiceRequest( { op:"status", status:"Service not available..." } );
		wsAuth.abortRequest();
		if( requestTimer ) { clearTimeout( requestTimer ); requestTimer = null; }
		pendingServiceRequest = null;
	}
}

function requestService( service, user_id, password, cb ) {
	if( !pendingServiceRequest ) {
		currentProtocol = service;
		// callback after addMethod of anther connection happens.
		pendingServiceRequest = cb;
		
		// { msg: "login", user:user_id, pass:password, devkey: localStorage.getItem("clientKey") }

		function doRequest() {
			requestTimer = setTimeout( timeoutRequest, 5000 );
			wsAuth.request( service, function(msg,data) {
				//console.log( "got requested service:", service, msg )
				if( !msg ) {
					cb( false, data );
					return;
				}
				// {op:"serviceReply", id:"B3D2Z$EvTox_9Pf$VAot8i6wC$JZPV0rHlW8zWAjIHQ=",port:32678,address:"198.143.191.26",service:"KCHATAdmin"}
				//redirect = "wss://"+msg.address+":"+msg.port+"/";
				//https_redirect = "https://"+msg.address+":"+msg.port+"/";
				currentProtocol = msg.service;
				openSocket( msg.service, 2, cb, msg.id, "wss://"+msg.address+":"+msg.port+"/" );
				//ws.close(); // trigger connect to real service...
			} );
		}

		if( user_id && password ) {
			wsAuth.login( user_id, password, ( success, userid, username )=>{
				protocol.username = username;
				protocol.userid = userid;
				if( success ) {
					doRequest();
				} else {
					cb( { op:"status", status:userid } );
					pendingServiceRequest  = null;
				}
			} );
		} else {
			if( wsAuth ) {
				doRequest();
			} else
				cb( { op:"status", status:"Not Logged In" } );
		}
	} else {
		pendingServiceRequest( { op:"status", status:"Service request pending..." } );
	}
	}


	return protocol;
}

//export {protocol}

const l_sw = {
	rid : 0,
        clients : new Map(),
        expectations : [],
};


self.addEventListener( "activate", activation );
self.addEventListener( "install", installation );

self.addEventListener( "fetch", handleFetch );
self.addEventListener( "message", handleMessage );


function activation( event ) {
    	console.log( "ACTIVATION EVENT:", event );
        console.log( "Outstanding clients:", l_sw.clients );
        clients.claim();
    }

function installation( event ) {
    	console.log( "INSTALLATION EVENT:", event );
        console.log( "Outstanding clients:", l_sw.clients );
    }

function resourceReply( client, msg ) {
    client = l_sw.clients.get( client.id );
		//console.log( "Handle standard request....", msg, client.requests );
		const reqId = client.requests.findIndex( (req)=>req.id === msg.id );

		if( reqId >= 0 )
		{
			const req = client.requests[reqId];
			clearTimeout( req.timeout );
			client.requests.splice( reqId, 1 );
			const headers = new Headers( { 'Content-Type':msg.mime} );
			const response = new Response( msg.resource, { status:200, statusText:"Ok(WS)", headers :headers });
                        //console.log( "Resolve with ressponce" );
			req.res( response );
		}
		else
			throw new Error( "Outstanding request not found" );			
	
}

function getMessageClient( event ) {
    let oldClient = null;
    if( "source" in event ){
        const clientId = event.source.id;
	oldClient = l_sw.clients.get( clientId );
        if( !oldClient ) {
	    const newClient = {
        		client : event.source
			, requests : []
			, uiSocket : null
                        , protocol : null
                        , localStorage: null
                        , peers : []
    	    };
            l_sw.clients.set( clientId, newClient );

            newClient.protocol = makeProtocol( newClient.client );
            newClient.protocol.resourceReply = resourceReply;
	    newClient.protocol.serviceLocal = l_sw;

            newClient.localStorage = newClient.protocol.localStorage;

            return newClient;
        }else {
            return oldClient;
        }
    }

}

function getClient( event, asClient ) {

    // need to figure out which socket to request on.
    const clientId =
		event.resultingClientId !== ""
	   ? event.resultingClientId
	  : event.clientId;
    //console.log( "Attemping to get id from event instead...", clientId  );

    if( clientId ) {
    	const oldClient = l_sw.clients.get( clientId );
        if( oldClient ) {
            return oldClient;
        }
	const newClient = {
        	client : null  // event.source to send events to... but this is fetch result
       		, requests : asClient&&asClient.requests || []
		, uiSocket : asClient&&asClient.uiSocket
                , protocol : asClient&&asClient.protocol
                , localStorage: asClient&&asClient.localStorage
                , peers : [asClient]
        };
	if( asClient ) asClient.peers.push( newClient );
        l_sw.clients.set( clientId, newClient );

	self.clients.get(clientId).then( (client)=>{
		//console.log( "Clients resolve finally resulted??" );
		if( !client ) {
                    lprintf( "Client is not found... not a valid channel." );
                    return null;
                }
		newClient.client = client;
                if( !newClient.protocol ) {
	        	newClient.protocol = makeProtocol( client );
	            	newClient.protocol.resourceReply = resourceReply;
			newClient.protocol.serviceLocal = l_sw;
        		newClient.localStorage = newClient.protocol.localStorage;
                }
	        //console.log( "Found client...", client );
	        newClient.p = null; // outstanding promise no longer needed.
                return newClient;
        } ).catch(err=>{ console.log( "Error on getting client:", err ); } );
        return newClient ;
    }else {
	console.log( "Message from an unknowable location?!" );
        return null;
    }
}
const decoder = new TextDecoder();

function handleFetch( event ) {
	const req = event.request;
        let asClient = null;
        for( var e = 0; e < l_sw.expectations.length; e++ ) {
                const exp = l_sw.expectations[e];
	        if( req.url.endsWith( exp.url ) ){
			asClient = exp.client;
                        l_sw.expectations.splice( e, 1 );
			break;
                }
        }

        const client = getClient( event, asClient );

	event.respondWith(
        	(()=>{
                        if( !client ) {
                            console.log( "Client hasn't talked yet... and we don't have a socket for it." );
			    return fetch( event.request );
                        }
			//console.log( "FETCH:", req, client );
			if( req.method === "GET" ) {
				//console.log( "got Get request:", req.url );
				if( !client ) {
                                    	console.log( "fetch event on a page we don't have a socket for..." );
                               	}
				if( client && client.uiSocket ) {
					const url = req.url;
					const newEvent={ id:l_sw.rid++, event:event, res:null, rej:null, p:null, timeout:null };
					client.requests.push( newEvent );
					const p = new Promise( (res,rej)=>{
						newEvent.res = res; newEvent.rej = rej;
						newEvent.timeout = setTimeout( ()=>{

							console.log( "5 second delay elapsed... reject" );
							const response = new Response( "Timeout", { status:408, statusText:"Timeout" });
							res( response );
							client.uiSocket = null;
							const reqId = client.requests.findIndex( (client)=>client.id === newEvent.id );
							if( reqId >= 0 )
								client.requests.splice( reqId );

						}, 5000 );
					} );
					newEvent.p = p;

					//console.log( "Post event to corect socket...", client.uiSocket );

					client.protocol.send( client.uiSocket
                                                             , {op:"get", url:url, id:newEvent.id } );
                                        return p;
				}
			}
		        return fetch( event.request );
		 })()
	);
}

function handleMessage( event ) {
	const msg = event.data;
        //console.log("HAndle message: (to get client)", msg );
        const client = getMessageClient( event ); // captures event.source for later response

	if( msg.op === "Hello" ) ;else if( msg.op === "expect" ) {
        	l_sw.expectations.push( {client:client, url:msg.url } );
	}else if( msg.op === "get" ) {
            // this comes back in from webpage which
            // actually handled the server's response...
            if( !client )
                console.log( "Response to a fetch request to a client that is no longer valid?" );
		// echo of fetch event to do actual work....
		// well... something.
		//console.log( "Handle standard request....", msg );
		const reqId = client.requests.findIndex( (client)=>client.id === msg.id );
		if( reqId >= 0 )
		{
			const req = client.requests[reqId];
			client.requests.splice( reqId );
                        const headers = new Headers();
                        headers.append( 'Content-Type', msg.mime );
			const response = new Response( msg.resource
	                        , {headers:headers
                            		, status:200, statusText:"Ok" }
                                     );
                        // and finish the promise which replies to the
                        // real client.
                        req.p.res( response );
		} else {
			console.log( "Failed to find the requested request" );
		}
	}else if( msg.op === "getItem" ) {
		// reply from getItem localStorage.
		client.localStorage.respond( msg.val );
	}else if( msg.op === "setUiLoader" ) {
		client.uiSocket = msg.socket;
	}else if( msg.op === "setLoader" ) {
		// reply from getItem localStorage.
		client.localStorage.respond( msg.id );
	}
	else {
            if( client && client.protocol )
	            client.protocol.handleMessage( event, msg );
	}
}
