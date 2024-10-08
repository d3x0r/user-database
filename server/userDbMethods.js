
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

ws.resume = function () {
	const key = localStorage.getItem( "sack/udb/resume" );
	if( key ) {
		ws.send(`{op:resume,id:${JSON.stringify(key)}}`);
		return true;
	}
	return false;
}

ws.doLogin = function (user, pass) {
	//ws.send(
	pass = SaltyRNG.id(pass);
	ws.send(`{op:login,account:${JSON.stringify(user)},password:${JSON.stringify(pass)}
        		,clientId:${JSON.stringify(localStorage.getItem("sack/udb/clientId"))}
                        ,deviceId:${JSON.stringify(localStorage.getItem("sack/udb/deviceId"))} }`);

}
ws.doCreate = function (display, user, pass, email) {
	//ws.send(
	pass = SaltyRNG.id(pass);
	email = SaltyRNG.id(email);
	ws.send(JSON.stringify( {op:"create",account:user,password:pass
            		,user:display,email:email
        		,clientId:localStorage.getItem("sack/udb/clientId")
                        ,deviceId:localStorage.getItem("sack/udb/deviceId") }));
}
ws.doGuest = function (user) {
	//ws.send(
	ws.send(`{op:guest,user:${JSON.stringify(user)}
        		,clientId:${JSON.stringify(localStorage.getItem("sack/udb/clientId"))}
                        ,deviceId:${JSON.stringify(localStorage.getItem("sack/udb/deviceId"))} }`);
}

ws.getService = function (domain, service) {
	//ws.send(
	ws.send(`{op:"service",domain:${JSON.stringify(domain)},service:${JSON.stringify(service)}}`);
}


const sesKey = localStorage.getItem("seskey");
if (sesKey) {
	// auto reconnect
	ws.send(`{op:"Login",seskey:${JSON.stringify(sesKey)}
        		,clientId:${JSON.stringify(localStorage.getItem("sack/udb/clientId"))}
                        ,deviceId:${JSON.stringify(localStorage.getItem("sack/udb/deviceId"))} }`);

}

ws.request = function (domain, service) {
	// like getService?  
	const pend = { op: "request", id: SaltyRNG.Id(), p: null, domain: domain, service: service, res: null, rej: null };
	ws.send(`{op:"request",id:'${pend.id}',domain:${JSON.stringify(domain)},service:${JSON.stringify(service)}}`);
	pend.p = new Promise((res, rej) => {
		pend.res = res; pend.rej = rej;
	}).then((msg) => {
		console.log(" Service should have addr...", msg);
		const idx = l.pending.findIndex(p => p === pend);
		if (idx >= 0) l.pending.splice(idx, 1);
		else console.log("Failed to find pending request.");
		return msg;
	})
	l.pending.push(pend);
	return pend.p;
}

ws.processMessage = function (ws, msg) {
	//console.log("socket gets a turn?", msg);
	if (msg.op === "login") {
		if (msg.success)
			;//Alert(" Login Success" );
		else if (msg.ban) {
			Alert("Bannable Offense");
			localStorage.removeItem("sack/udb/clientId"); // reset this
			ws.close(1000, "Client respecting ban, and resetting");
		} else if (msg.device) {
			//temporary failure, this device was unidentified, or someone elses
			ws.send(JSON.stringify({ op: "device", deviceId: SaltyRNG.Id() }));
			return true;
		} else
			Alert("Login Failed...");
	} else if (msg.op === "create") {
		if (msg.success) {
			//Alert(" Login Success" );
			localStorage.setItem("sack/udb/deviceId", msg.deviceId);
		} else if (msg.ban) {
			Alert("Bannable Offense");
			localStorage.removeItem("sack/udb/clientId"); // reset this
			ws.close(1000, "Create count respecting ban, resetting");
		} else if (msg.device) {
			//temporary failure, this device was unidentified, or someone elses
			const newId = SaltyRNG.Id();
			localStorage.setItem("sack/udb/deviceId", newId);
			ws.send(JSON.stringify({ op: "device", deviceId: newId }));
			return true;
		} else
			Alert("Login Failed...");

	} else if (msg.op === "set") {
		localStorage.setItem( "sack/udb/"+ msg.value, msg.key);
		return true; // client doesn't care.
	} else if (msg.op === "guest") {
		if (msg.success) {
			;//Alert(" Login Success" );
		} else
			Alert("Login Failed...");
	} else if (msg.op === "expect") {
		debugger;
		ws.on( "expect", msg );
	} else if (msg.op === "device") {
		console.log( "Device specified is inactive - too many devices?" );
		debugger;
		ws.on( "deviceInactive", msg );
	} else if (msg.op === "pickSash") {
		// this is actually a client event.
	} else if (msg.op === "request") {
		// reply from server
		for (let pend of l.pending) {
			if (pend.id === msg.id) {
				if (msg.ok) {
					console.log("Got resolved service:", msg, msg.svc);
					pend.res({ svc: msg.svc, name: msg.name }); // return my user name also... (account login doesn't know)
				} else {
					if (msg.probe) Alert("Probe for services detected");
				}
			}
		}
	} else {
		console.log( "Server sent unhandled message:", msg );
	}

}
