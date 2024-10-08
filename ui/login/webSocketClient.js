
//import {popups,AlertForm} from "../popups.mjs"
//const JSOX = JSON;

// right now this gets loaded via proxy, and sent from the origin website, 
// this means any dependancies are from the client website, unless otherwise hardcoded here.
// 

//const origin = "https://d3x0r.org:8089"

const here = new URL(import.meta.url);
//console.log( "Origin? Meta?", location, import.meta, here );

import { popups, AlertForm } from "/node_modules/@d3x0r/popups/popups.mjs"
import { JSOX } from "/node_modules/jsox/lib/jsox.mjs"
//console.log( "location:", location, import.meta );

let workerInterface = null;
const importing = import(here.origin + "/node_modules/@d3x0r/socket-service/swc.js").then((module) => {
	workerInterface = module.workerInterface;
	workerInterface.initWorker();
}).catch((err) => {
	// might not support workers... maybe we can just serve the websockets?
	workerInterface = {
		//res( workerInterface.connect(addr, protocol || "login", status, processMessage) );
		async connect(addr,protocol,status, processMessage ) {
			return new Promise( (res,rej)=>{
				const ws = new WebSocket( addr, protocol );
				const events = {
					close:[],
				}
				ws.onopen = (evt)=>{
					console.log( "websocket connected?")
					res( socket );
				}
				ws.onmessage = (evt)=>{
					processMessage( socket, evt.data );
				}
				ws.onclose = (evt)=>{
					console.log( "websocket closed?", evt)
				}
				const socket = {
					setUiLoader() {},
					close() {},
					on(a,b){
						if( a == "close" ) {
							if( "function" == typeof b )
								events.close.push(b);
						}
						else 
							ws.on(a,b);
					},
					//processMessage( ws,msg) {},
					send(a) {
						ws.send(a);
					},
				}
			})
		}
	}
	/*
	if (!alertForm) alertForm = new AlertForm();
	alertForm.caption = "Site does not support socket-service.\n" + err.message;
	alertForm.show();
	*/
});
//import {workerInterface} from location.origin+"/socket-service-client.js"

let isGuestLogin = false;
let createMode = false;

const towers = [here.protocol.replace("http","ws") + "//" + here.host + "/",
	location.protocol.replace("http", "ws") + "//" + location.host + "/",
	"wss://d3x0r.org:8089/",
	"wss://poopfixer.com:8089/",

];


// loginForm = {
//     connect() {
//     },
//     disconnect() {
//     },
//     login() {
//     }


const l = {
	ws: null,

	loginForm: null,

	bindControls(popup, root) {
		l.loginForm = popup;

		const f = root;

		const form1 = f.querySelector("#loginForm");

		const form2 = f.querySelector("#createForm");
		const form3 = f.querySelector("#guestForm");
		if (!form1 && !form2 && !form3) return;
		if (form3) form3.style.display = "none";
		if (form2) form2.style.display = "none";
		//form3.style.display = "none";

		const userField = form1.querySelector("#user");
		const passField = form1.querySelector("#password");

		const nameField2 = form2.querySelector("#name");
		const userField2 = form2.querySelector("#user");
		const emailField2 = form2.querySelector("#email");
		const passField2 = form2.querySelector("#password");
		const passField22 = form2.querySelector("#password2");

		const userField3 = form3 && form3.querySelector("#user");
		const userLogin = f.querySelector("#doLogin");

		const createAccount = f.querySelector("#createAccount");
		const createAccountInner = f.querySelector("#createAccountInner");
		const guestLogin = f.querySelector("#guestLogin");
		const guestLoginInner = f.querySelector("#guestLoginInner");


		form1.addEventListener("submit", (evt) => {
			evt.preventDefault();
			doUserLogin();
			return false;
			//console.log( "Form1 submit key?" );
		})
		form2.addEventListener("submit", (evt) => {
			evt.preventDefault();
			doUserLogin();
			return false;
			//console.log( "Form2 submit key?" );
		})
		form3.addEventListener("submit", (evt) => {

			evt.preventDefault();
			doUserLogin();
			return false;
			//console.log( "Form3 submit key?" );
		})
		const doGuestLogin = () => {
			if (isGuestLogin) {
				form3.style.display = "none";
				if (createMode) {
					form2.style.display = "";
					form1.style.display = "none";
				} else {
					form2.style.display = "none";
					form1.style.display = "";
				}
				guestLoginInner.textContent = "Use Guest Login";
				isGuestLogin = false;
			} else {
				form3.style.display = "";
				form2.style.display = "none";
				form1.style.display = "none";
				guestLoginInner.textContent = "Use Account Login";
				isGuestLogin = true;
			}
			userField3.focus();
			popup.center();
		}

		popups.handleButtonEvents(guestLogin, doGuestLogin);

		const doCreateButton = () => {
			if (createMode) {
				form3.style.display = "none";
				form2.style.display = "none";
				form1.style.display = "";

				createAccountInner.innerText = "Create Account";
				userField.focus();
				popup.center();
			} else {
				form3.style.display = "none";
				form2.style.display = "";
				form1.style.display = "none";

				createAccountInner.innerText = "Use Account";
				nameField2.focus();
				popup.center();
			}
			guestLoginInner.textContent = "Use Guest Login";
			isGuestLogin = false;
			createMode = !createMode;
		}

		popups.handleButtonEvents(createAccount, doCreateButton);


		passField22.addEventListener("blur", () => {

		});

		const doUserLogin = () => {
			if (!l.ws) {
				if (!alertForm) alertForm = new AlertForm();
				alertForm.caption = "Waiting for connect...";
				alertForm.show();
				return
			}
			if (isGuestLogin) {
				if (userField3.value.length < 3) {
					if (!alertForm) alertForm = new AlertForm();
					alertForm.caption = "Please use a longer display name...";
					alertForm.show();
				} else {
					l.ws.doGuest(userField3.value);
				}
			}
			else {
				if (createMode) {
					if (passField2.value === passField22.value)
						l.ws.doCreate(nameField2.value, userField2.value, passField2.value, emailField2.value);
					else {
						if (!alertForm) alertForm = new AlertForm();
						alertForm.caption = "Please reconfirm your password...";
						alertForm.show();
					}

				} else {
					if (l.ws.doLogin)
						l.ws.doLogin(userField.value, passField.value);
					else {
						if (!alertForm) alertForm = new AlertForm();
						alertForm.show("Login is not ready...");
					}
				}
			}
		}
		popups.handleButtonEvents(userLogin, doUserLogin);
		popup.center();
		popup.show();
		userField.focus();
	},
	request(domain, service) {
		return l.ws.request(domain, service);
	},
	openSocket: openSocket,
	resume() {
		if( l.ws )
			return l.ws.resume();
		return false;
	},
	events: {},
	on(evt, d) {
		if ("function" === typeof d) {
			if (evt in l.events) l.events[evt].push(d);
			else l.events[evt] = [d];
			return d;
		} else {
			let result = null;
			if (evt in l.events) l.events[evt].forEach(cb => (result = cb(d, result)));
			return result;
		}
	}

}
const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

let alertForm = null;

function Alert(s) {
	if (!alertForm) alertForm = new AlertForm(l.loginForm.divFrame.parentNode);
	alertForm.caption = s;
	alertForm.show();
}


function processMessage(ws,msg_) {
	const msg = JSOX.parse(msg_);
	if ( ws.processMessage && ws.processMessage(ws, msg)) return;

	if (msg.op === "addMethod") {
		try {
			// why is this not in a module?
			var f = new AsyncFunction("JSON", "Import", "connector", "Alert", msg.code);
			const p = f.call(ws, JSOX, (i) => import(i), l, Alert);
			l.connected = true;
			l.ws = ws;
			l.ws.on("close", (code,reason)=>{
				console.log( "Connection ended... ", code, reason ); 
				console.log( "Suppose we still need to connect?" );
				l.on( "close", [code,reason] );

			})
			if (l.loginForm) l.loginForm.connect();
			// result should trigger normal events in login form to close.
			p.then( ()=>{
				ws.resume();
			});
		} catch (err) {
			console.log("Function compilation error:", err, "\n", msg.code);
		}
	}
	else if (msg.op === "login") {
		if (msg.success) {
			//Alert(" Login Success" );
			if (l.loginForm && l.loginForm.login)
				l.loginForm.login(true);
		} else if (msg.ban) {
			Alert("Bannable Offense");
		} else if (msg.device) {
			//temporary failure, this device was unidentified, or someone elses
		} else
			Alert("Login Failed...");

	}
	else if (msg.op === "guest") {
		if (msg.success) {
			//Alert(" Login Success" );
			if (l.loginForm && l.loginForm.login)
				l.loginForm.login(true);
		} else
			Alert("Login Failed...");

	}
	else if (msg.op === "create") {
		if (msg.success) {
			if (l.loginForm && l.loginForm.login)
				l.loginForm.login(1);
			//Alert(" Login Success" );			
		} else if (msg.device) {
			//temporary failure, this device was unidentified, or someone elses
		} else if (msg.ban) {
			Alert("Bannable Offense");
		} else if (msg.account) {
			Alert("Account name in use...");
		} else if (msg.email) {
			Alert("Email already in use... <br> Try account recovery?");
		} else {
			Alert("Creation Failed...");
		}

	}
	else if (msg.op === "pickSash") {
		// this is actually a client event.
		pickSash(ws, msg.choices);
	}
}

async function pickSash(ws, choices) {
	if (l.loginForm && l.loginForm.pickSash) {
		const choice = await l.loginForm.pickSash(msg.choices);
		if (choice)
			ws.send({ op: "pickSash", ok: true, sash: choice });
		else
			ws.send({ op: "pickSash", ok: false, sash: "User Declined Choice." });
	}
	ws.send({ op: "pickSash", ok: false, sash: "Choice not possible." });
}

function status( msg, arg ) {
	if( "string" ===typeof( msg ) ) {
		console.log( "Service worker sent status:", msg );
	} else if( msg === true ) {
		console.log( "Opening socketid:", arg );
	}
}


async function openSocket(addr, protocol ) {
	if (!workerInterface) {
		await importing
	}
	return new Promise((res, rej) => {

		let index = -1;
		if( addr )
			tryOne(addr);
		else {
			index++;
			tryOne(towers[index]);
		}
		function tryOne(addr) {
			res( workerInterface.connect(addr, protocol || "login", status, processMessage) );
		}

	})
}


export { l as connection, Alert, openSocket };


