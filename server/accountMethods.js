
const ws = this;
//console.log("Extend this websocket:", this);

const SaltyRNGModule = await Import("/node_modules/@d3x0r/srg2/salty_random_generator2.mjs");
const SaltyRNG = SaltyRNGModule.SaltyRNG;
//ws.SaltyRNG = SaltyRNG;

if(true) {
	const clientKey = localStorage.getItem("sack/udb/clientId");
	if (!clientKey) {
		// this is ignored if server doesn't track unique devices
		ws.send(`{op:newClient}`);
	}
}

const l = {
	pending: []
}

ws.getProfile = function () {
	return new Promise( (res,rej)=>{
		//const key = localStorage.getItem( "sack/udb/resume" );
			const p = {res,rej,id:SaltyRNG.Id()};
			l.pending.push( p );
			ws.send(`{op:resume,id:${JSON.stringify(p.id)},uid:${JSON.stringify(key)}}`);
	} );
}

ws.processMessage = function (ws, msg) {
	//console.log("socket gets a turn?", msg);
	if( msg.op === "resume"){
		let pend = null;
		for( let p = 0; p < l.pending.length; p++ ) {
			pend = l.pending[p];
			if( l.pending[p].id === msg.id ) {
				l.pending.splice(p,1);
				break;
			}
		}
		if( !pend ) {
			console.log( "Failed to find pending for :", msg );
			return;
		}
		if (msg.success) {
			pend.res();
		} else 
			pend.rej();
		return true;
	} else if (msg.op === "login") {
		//console.log( "login message received:", msg );
		let pend = null;
		for( let p = 0; p < l.pending.length; p++ ) {
			pend = l.pending[p];
			if( l.pending[p].id === msg.id ) {
				l.pending.splice(p,1);
				break;
			}
		}
		if( !pend ) {
			console.log( "Failed to find pending for :", msg );
			return;
		}
		if (msg.success) {
			pend.res();//Alert(" Login Success" );
		} else if (msg.ban) {
			pend.rej( "Bannable Offense");
			Alert("Bannable Offense");
			localStorage.removeItem("sack/udb/clientId"); // reset this
			ws.close(1000, "Client respecting ban, and resetting");
		} else if (msg.device) {
			//temporary failure, this device was unidentified, or someone elses
			ws.send(JSON.stringify({ op: "device", deviceId: SaltyRNG.Id() }));
		} else {
			pend.rej( "Login Failed");
			Alert("Login Failed...");
		}
		return true;
	} else if (msg.op === "create") {
		let pend = null;
		for( let p = 0; p < l.pending.length; p++ ) {
			pend = l.pending[p];
			if( p.id === msg.id ) {
				l.pending.splice(p,1);
				break;
			}
		}
		if (msg.success) {
			//Alert(" Login Success" );
			pend.res();
			localStorage.setItem("sack/udb/deviceId", msg.deviceId);
		} else if (msg.ban) {
			pend.rej( "Bannable Offense" );
			//Alert("Bannable Offense");
			localStorage.removeItem("sack/udb/clientId"); // reset this
			ws.close(1000, "Create count respecting ban, resetting");
		} else if (msg.device) {
			//temporary failure, this device was unidentified, or someone elses
			const newId = SaltyRNG.Id();
			localStorage.setItem("sack/udb/deviceId", newId);
			ws.send(JSON.stringify({ op: "device", deviceId: newId }));
			return true;
		} else if (msg.account) {
			pend.rej( "Account exists..." );
			Alert("Account Exists...");
		} else {
			pend.rej( "Login Failed" );
			Alert("Login Failed...");
		}
		return true;

	} else if (msg.op === "set") {
		localStorage.setItem( "sack/udb/"+ msg.value, msg.key);
		return true; // client doesn't care.
	} else if (msg.op === "guest") {
		let pend = null;
		for( let p = 0; p < l.pending.length; p++ ) {
			pend = l.pending[p];
			if( p.id === msg.id ) {
				l.pending.splice(p,1);
				break;
			}
		}
		if (msg.success) {
			;//Alert(" Login Success" );
		} else
			Alert("Login Failed...");
		return true;
	} else if (msg.op === "expect") {
		ws.on( "expect", msg );
		return true;
	} else if (msg.op === "device") {
		console.log( "Device specified is inactive - too many devices?" );
		ws.on( "deviceInactive", msg );
		return true;
	} else if (msg.op === "pickSash") {
		// this is actually a client event.
		return true;
	} else if (msg.op === "request") {
		// reply from server
		for (let pend of l.pending) {
			if (pend.id === msg.id) {
				if (msg.ok) {
					//console.log("Got resolved service:", msg, msg.svc);
					pend.res({ svc: msg.svc, name: msg.name }); // return my user name also... (account login doesn't know)
				} else {
					if (msg.probe) Alert("Probe for services detected");
				}
			}
		}
		return true;
	} else {
		console.log( "Server sent unhandled message:", msg );
	}

}
