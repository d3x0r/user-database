//"use strict";
// jsox.js
// JSOX JavaScript Object eXchange. Inherits human features of comments
// and extended formatting from JSON6; adds macros, big number and date
// support.  See README.md for details.
//
// This file is based off of https://github.com/JSON6/  ./lib/json6.js
// which is based off of https://github.com/d3x0r/sack  ./src/netlib/html5.websocket/json6_parser.c
//
var exports = exports || {};
////const util = require('util'); // debug inspect.
//import util from 'util'; 

const _JSON=JSON; // in case someone does something like JSON=JSOX; we still need a primitive _JSON for internal stringification
const JSOX = exports;
JSOX.version = "1.2.108";

//function privateizeEverything() {
//const _DEBUG_LL = false;
//const _DEBUG_PARSING = false;
//const _DEBUG_STRINGIFY = false;
//const _DEBUG_PARSING_STACK = false;
//const _DEBUG_PARSING_NUMBERS = false;
//const _DEBUG_PARSING_DETAILS = false;
//const _DEBUG_PARSING_CONTEXT = false;
//const _DEBUG_REFERENCES = false; // this tracks folling context stack when the components have not been completed.
//const _DEBUG_WHITESPACE = false; 
const hasBigInt = (typeof BigInt === "function");
const VALUE_UNDEFINED = -1;
const VALUE_UNSET = 0;
const VALUE_NULL = 1;
const VALUE_TRUE = 2;
const VALUE_FALSE = 3;
const VALUE_STRING = 4;
const VALUE_NUMBER = 5;
const VALUE_OBJECT = 6;
const VALUE_NEG_NAN = 7;
const VALUE_NAN = 8;
const VALUE_NEG_INFINITY = 9;
const VALUE_INFINITY = 10;
//const VALUE_DATE = 11  // unused yet; this is actuall a subType of VALUE_NUMBER
const VALUE_EMPTY = 12; // [,] makes an array with 'empty item'
const VALUE_ARRAY = 13; //
// internally arrayType = -1 is a normal array
// arrayType = -2 is a reference array, which, which closed is resolved to
//     the specified object.
// arrayType = -3 is a normal array, that has already had this element pushed.
const knownArrayTypeNames = ["ab","u8","cu8","s8","u16","s16","u32","s32","u64","s64","f32","f64"];
let arrayToJSOX = null;
let mapToJSOX = null;
const knownArrayTypes = [ArrayBuffer
                        ,Uint8Array,Uint8ClampedArray,Int8Array
                        ,Uint16Array,Int16Array
                        ,Uint32Array,Int32Array
                        ,null,null//,Uint64Array,Int64Array
                        ,Float32Array,Float64Array];
// somehow max isn't used... it would be the NEXT available VALUE_XXX value...
//const VALUE_ARRAY_MAX = VALUE_ARRAY + knownArrayTypes.length + 1; // 1 type is not typed; just an array.

const WORD_POS_RESET = 0;
const WORD_POS_TRUE_1 = 1;
const WORD_POS_TRUE_2 = 2;
const WORD_POS_TRUE_3 = 3;
const WORD_POS_FALSE_1 = 5;
const WORD_POS_FALSE_2 = 6;
const WORD_POS_FALSE_3 = 7;
const WORD_POS_FALSE_4 = 8;
const WORD_POS_NULL_1 = 9;
const WORD_POS_NULL_2 = 10;
const WORD_POS_NULL_3 = 11;
const WORD_POS_UNDEFINED_1 = 12;
const WORD_POS_UNDEFINED_2 = 13;
const WORD_POS_UNDEFINED_3 = 14;
const WORD_POS_UNDEFINED_4 = 15;
const WORD_POS_UNDEFINED_5 = 16;
const WORD_POS_UNDEFINED_6 = 17;
const WORD_POS_UNDEFINED_7 = 18;
const WORD_POS_UNDEFINED_8 = 19;
const WORD_POS_NAN_1 = 20;
const WORD_POS_NAN_2 = 21;
const WORD_POS_INFINITY_1 = 22;
const WORD_POS_INFINITY_2 = 23;
const WORD_POS_INFINITY_3 = 24;
const WORD_POS_INFINITY_4 = 25;
const WORD_POS_INFINITY_5 = 26;
const WORD_POS_INFINITY_6 = 27;
const WORD_POS_INFINITY_7 = 28;

const WORD_POS_FIELD = 29;
const WORD_POS_AFTER_FIELD = 30;
const WORD_POS_END = 31;
const WORD_POS_AFTER_FIELD_VALUE = 32;
//const WORD_POS_BINARY = 32;

const CONTEXT_UNKNOWN = 0;
const CONTEXT_IN_ARRAY = 1;
const CONTEXT_OBJECT_FIELD = 2;
const CONTEXT_OBJECT_FIELD_VALUE = 3;
const CONTEXT_CLASS_FIELD = 4;
const CONTEXT_CLASS_VALUE = 5;
const CONTEXT_CLASS_FIELD_VALUE = 6;
const keywords = {	["true"]:true,["false"]:false,["null"]:null,["NaN"]:NaN,["Infinity"]:Infinity,["undefined"]:undefined };

const contexts = [];
function getContext() {
	let ctx = contexts.pop();
	if( !ctx )
		ctx = { context : CONTEXT_UNKNOWN
		      , current_proto : null
		      , current_class : null
		      , current_class_field : 0
		      , arrayType : -1
		      , valueType : VALUE_UNSET
		      , elements : null
		      };
	return ctx;
}
function dropContext(ctx) { 
/*
	console.log( "Dropping context:", ctx );
	ctx.elements = null;
	ctx.name = null;
	ctx.valueType = VALUE_UNSET;
	ctx.arrayType = -1;
*/
	contexts.push( ctx ); 
}

const buffers = [];
function getBuffer() { let buf = buffers.pop(); if( !buf ) buf = { buf:null, n:0 }; else buf.n = 0; return buf; }
function dropBuffer(buf) { buffers.push( buf ); }


JSOX.escape = function(string) {
	let n;
	let output = '';
	if( !string ) return string;
	for( n = 0; n < string.length; n++ ) {
		if( ( string[n] == '"' ) || ( string[n] == '\\' ) || ( string[n] == '`' )|| ( string[n] == '\'' )) {
			output += '\\';
		}
		output += string[n];
	}
	return output;
};


let toProtoTypes = new WeakMap();
let toObjectTypes = new Map();
let fromProtoTypes = new Map();
let commonClasses = [];

JSOX.reset = resetJSOX;

function resetJSOX() {
	toProtoTypes = new WeakMap();
	toObjectTypes = new Map();
	fromProtoTypes = new Map();
	commonClasses = [];	
}


JSOX.begin = function( cb, reviver ) {

	const val = { name : null,	  // name of this value (if it's contained in an object)
			value_type: VALUE_UNSET, // value from above indiciating the type of this value
			string : '',   // the string value of this value (strings and number types only)
			contains : null,
			className : null,
		};
	
	const pos = { line:1, col:1 };
	let	n = 0;
	let     str;
	let	localFromProtoTypes = new Map();
	let	word = WORD_POS_RESET,
		status = true,
		redefineClass = false,
		negative = false,
		result = null,
		rootObject = null,
		elements = undefined,
		context_stack = {
			first : null,
			last : null,
			saved : null,
			push(node) {
				//_DEBUG_PARSING_CONTEXT && console.log( "pushing context:", node );
				let recover = this.saved;
				if( recover ) { this.saved = recover.next; 
					recover.node = node; 
					recover.next = null; 
					recover.prior = this.last; }
				else { recover = { node : node, next : null, prior : this.last }; }
				if( !this.last ) this.first = recover;
				else this.last.next = recover;
				this.last = recover;
				this.length++;
			},
			pop() {
				let result = this.last;
				// through normal usage this line can never be used.
				//if( !result ) return null;
				if( !(this.last = result.prior ) ) this.first = null;
				result.next = this.saved;
				if( this.last ) this.last.next = null;
				if( !result.next ) result.first = null;
				this.saved = result;
				this.length--;
				//_DEBUG_PARSING_CONTEXT && console.log( "popping context:", result.node );
				return result.node;
			},
			length : 0,
			/*dump() {  // //_DEBUG_CONTEXT_STACK
				console.log( "STACK LENGTH:", this.length );
				let cur= this.first;
				let level = 0;
				while( cur ) {
					console.log( "Context:", level, cur.node );
					level++;
					cur = cur.next;
				}
			}*/
		},
		classes = [],  // class templates that have been defined.
		protoTypes = {},
		current_proto = null,  // the current class being defined or being referenced.
		current_class = null,  // the current class being defined or being referenced.
		current_class_field = 0,
		arrayType = -1,  // the current class being defined or being referenced.
		parse_context = CONTEXT_UNKNOWN,
		comment = 0,
		fromHex = false,
		decimal = false,
		exponent = false,
		exponent_sign = false,
		exponent_digit = false,
		inQueue = {
			first : null,
			last : null,
			saved : null,
			push(node) {
				let recover = this.saved;
				if( recover ) { this.saved = recover.next; recover.node = node; recover.next = null; recover.prior = this.last; }
				else { recover = { node : node, next : null, prior : this.last }; }
				if( !this.last ) this.first = recover;
				else this.last.next = recover;
				this.last = recover;
			},
			shift() {
				let result = this.first;
				if( !result ) return null;
				if( !(this.first = result.next ) ) this.last = null;
				result.next = this.saved; this.saved = result;
				return result.node;
			},
			unshift(node) {
				let recover = this.saved;
				// this is always true in this usage.
				//if( recover ) { 
					this.saved = recover.next; recover.node = node; recover.next = this.first; recover.prior = null; 
				//}
				//else { recover = { node : node, next : this.first, prior : null }; }
				if( !this.first ) this.last = recover;
				this.first = recover;
			}
		},
		gatheringStringFirstChar = null,
		gatheringString = false,
		gatheringNumber = false,
		stringEscape = false,
		cr_escaped = false,
		unicodeWide = false,
		stringUnicode = false,
		stringHex = false,
		hex_char = 0,
		hex_char_len = 0,
		completed = false,
		date_format = false,
		isBigInt = false
		;

	function throwEndError( leader ) {
		throw new Error( `${leader} at ${n} [${pos.line}:${pos.col}]`);
	}

	return {
		fromJSOX( prototypeName, o, f ) {
			if( localFromProtoTypes.get(prototypeName) ) throw new Error( "Existing fromJSOX has been registered for prototype" );
			function privateProto() { }
			if( !o ) o = privateProto;
			if( o && !("constructor" in o )){
				throw new Error( "Please pass a prototype like thing...");
			}
			localFromProtoTypes.set( prototypeName, { protoCon:o.prototype.constructor, cb:f } );
		},
		registerFromJSOX( prototypeName, o/*, f*/ ) {
			throw new Error( "registerFromJSOX is deprecated, please update to use fromJSOX instead:" + prototypeName + o.toString() );
		},
		finalError() {
			if( comment !== 0 ) { // most of the time everything's good.
				if( comment === 1 ) throwEndError( "Comment began at end of document" );
				if( comment === 3 ) throwEndError( "Open comment '/*' is missing close at end of document" );
				if( comment === 4 ) throwEndError( "Incomplete '/* *' close at end of document" );
			}
			if( gatheringString ) throwEndError( "Incomplete string" );
		},
		value() {
			this.finalError();
			let r = result;
			result = undefined;
			return r;
		},
		reset() {
			word = WORD_POS_RESET;
			status = true;
			if( inQueue.last ) inQueue.last.next = inQueue.save;
			inQueue.save = inQueue.first;
			inQueue.first = inQueue.last = null;
			if( context_stack.last ) context_stack.last.next = context_stack.save;
			context_stack.length = 0;
			context_stack.save = inQueue.first;
			context_stack.first = context_stack.last = null;//= [];
			elements = undefined;
			parse_context = CONTEXT_UNKNOWN;
			classes = [];
			protoTypes = {};
			current_proto = null;
			current_class = null;
			current_class_field = 0;
			val.value_type = VALUE_UNSET;
			val.name = null;
			val.string = '';
			val.className = null;
			pos.line = 1;
			pos.col = 1;
			negative = false;
			comment = 0;
			completed = false;
			gatheringString = false;
			stringEscape = false;  // string stringEscape intro
			cr_escaped = false;   // carraige return escaped
			date_format = false;
			//stringUnicode = false;  // reading \u
			//unicodeWide = false;  // reading \u{} in string
			//stringHex = false;  // reading \x in string
		},
		usePrototype(className,protoType ) { protoTypes[className] = protoType; },
		write(msg) {
			let retcode;
			if (typeof msg !== "string" && typeof msg !== "undefined") msg = String(msg);
			if( !status ) throw new Error( "Parser is still in an error state, please reset before resuming" );
			for( retcode = this._write(msg,false); retcode > 0; retcode = this._write() ) {
				if( typeof reviver === 'function' ) (function walk(holder, key) {
					let k, v, value = holder[key];
					if (value && typeof value === 'object') {
						for (k in value) {
							if (Object.prototype.hasOwnProperty.call(value, k)) {
								v = walk(value, k);
								if (v !== undefined) {
									value[k] = v;
								} else {
									delete value[k];
								}
							}
						}
					}
					return reviver.call(holder, key, value);
				}({'': result}, ''));
				result = cb( result );

				if( retcode < 2 )
					break;
			}
		},
		_write(msg,complete_at_end) {
			let cInt;
			let input;
			let buf;
			let retval = 0;
			function throwError( leader, c ) {
				throw new Error( `${leader} '${String.fromCodePoint( c )}' unexpected at ${n} (near '${buf.substr(n>4?(n-4):0,n>4?3:(n-1))}[${String.fromCodePoint( c )}]${buf.substr(n, 10)}') [${pos.line}:${pos.col}]`);
			}

			function RESET_VAL()  {
				val.value_type = VALUE_UNSET;
				val.string = '';
				val.contains = null;
				//val.className = null;
			}

			function convertValue() {
				let fp = null;
				//_DEBUG_PARSING && console.log( "CONVERT VAL:", val );
				switch( val.value_type ){
				case VALUE_NUMBER:
					//1502678337047
					if( ( ( val.string.length > 13 ) || ( val.string.length == 13 && val[0]>'2' ) )
					    && !date_format && !exponent_digit && !exponent_sign && !decimal ) {
						isBigInt = true;
					}
					if( isBigInt ) { if( hasBigInt ) return BigInt(val.string); else throw new Error( "no builtin BigInt()", 0 ) }
					if( date_format ) { const r = new Date( val.string ); if(isNaN(r.getTime())) throwError( "Bad number format", cInt ); return r;  }
					return  (negative?-1:1) * Number( val.string );
				case VALUE_STRING:
					if( val.className ) {
						fp = localFromProtoTypes.get( val.className );
						if( !fp )
							fp = fromProtoTypes.get( val.className );
						if( fp && fp.cb ) {
							val.className = null;
							return fp.cb.call( val.string );
						} else {
							// '[object Object]' throws this error.
							throw new Error( "Double string error, no constructor for: new " + val.className + "("+val.string+")" )
						}	
					}
					return val.string;
				case VALUE_TRUE:
					return true;
				case VALUE_FALSE:
					return false;
				case VALUE_NEG_NAN:
					return -NaN;
				case VALUE_NAN:
					return NaN;
				case VALUE_NEG_INFINITY:
					return -Infinity;
				case VALUE_INFINITY:
					return Infinity;
				case VALUE_NULL:
					return null;
				case VALUE_UNDEFINED:
					return undefined;
				case VALUE_EMPTY:
					return undefined;
				case VALUE_OBJECT:
					if( val.className ) { 
						//_DEBUG_PARSING_DETAILS && console.log( "class reviver" );
						fp = localFromProtoTypes.get( val.className );
						if( !fp )
							fp = fromProtoTypes.get( val.className );
						val.className = null;
						if( fp && fp.cb ) return val.contains = fp.cb.call( val.contains ); 
					}
					return val.contains;
				case VALUE_ARRAY:
					//_DEBUG_PARSING_DETAILS && console.log( "Array conversion:", arrayType, val.contains );
					if( arrayType >= 0 ) {
						let ab;
						if( val.contains.length )
							ab = DecodeBase64( val.contains[0] );
						else ab = DecodeBase64( val.string );
						if( arrayType === 0 ) {
							arrayType = -1;
							return ab;
						} else {
							const newab = new knownArrayTypes[arrayType]( ab );
							arrayType = -1;
							return newab;
						}
					} else if( arrayType === -2 ) {
						let obj = rootObject;
						//let ctx = context_stack.first;
						let lvl;
						//console.log( "Resolving Reference...", context_stack.length );
						//console.log( "--elements and array", elements );
						
						const pathlen = val.contains.length;
						for( lvl = 0; lvl < pathlen; lvl++ ) {
							const idx = val.contains[lvl];
							//_DEBUG_REFERENCES && console.log( "Looking up idx:", idx, "of", val.contains, "in", obj );
							let nextObj = obj[idx];

							//_DEBUG_REFERENCES  && console.log( "Resolve path:", lvl, idx,"in", obj, context_stack.length, val.contains.toString() );
							//_DEBUG_REFERENCES && console.log( "NEXT OBJECT:", nextObj );
							if( !nextObj ) {
								{
									let ctx = context_stack.first;
									let p = 0;
									//_DEBUG_PARSING_CONTEXT && context_stack.dump();
									while( ctx && p < pathlen && p < context_stack.length ) {
										const thisKey = val.contains[p];
										if( thisKey in obj ) {
											//console.log( "don't need to be in the context stack anymore------------------------------")
											break;
										}
										//_DEBUG_REFERENCES && console.log( "Checking context:", obj, "p=",p, "key=",thisKey, "ctx=",util.inspect(ctx), "ctxNext=",ctx.next);
										//console.dir(ctx, { depth: null })
										if( ctx.next ) {
											if( "number" === typeof thisKey ) {
												
												const asdf = ctx.next.node.elements;
												const actualObject = ctx.next.node.elements;
												//_DEBUG_REFERENCES && console.log( "Number in index... tracing stack...", obj, actualObject, ctx && ctx.next && ctx.next.next && ctx.next.next.node );

												if( asdf && thisKey >= asdf.length ) {
													//_DEBUG_REFERENCES && console.log( "AT ", p, actualObject.length, val.contains.length );
													if( p === (actualObject.length-1) ) {
														////_DEBUG_REFERENCES && 
															console.log( "This is actually at the current object so use that" );
														nextObj = elements;
														
														break;
													}
													else {
														if( ctx.next.next && thisKey === asdf.length ) {
															//_DEBUG_REFERENCES && console.log( "is next... ")
															nextObj = ctx.next.next.node.elements;
															ctx = ctx.next;
															p++;
															obj = nextObj;
															continue;
														}
														//_DEBUG_REFERENCES && console.log( "FAILING HERE", ctx.next, ctx.next.next, elements );
														nextObj = elements;
														p++; // make sure to exit.

														break;
														//obj = next
													}
												}
											} else {
												//_DEBUG_REFERENCES && console.log( "field AT index", p,"of", val.contains.length );
												if( thisKey !== ctx.next.node.name ){
													//_DEBUG_REFERENCES && console.log( "Expect:", thisKey, ctx.next.node.name, ctx.next.node.elements );
													nextObj = ( ctx.next.node.elements[thisKey] );
													//throw new Error( "Unexpected path-context relationship" );													
													lvl = p;
													break;
												} else {
													//_DEBUG_REFERENCES && console.log( "Updating next object(NEW) to", ctx.next.node, elements, thisKey)
													if( ctx.next.node.valueType === VALUE_ARRAY ){
														//_DEBUG_REFERENCES && console.log( "Using the array element of that")
														nextObj = ctx.next.node.elements_array;
													}else {
														nextObj = ctx.next.node.elements[thisKey];
														//_DEBUG_REFERENCES && console.log( "using named element from", ctx.next.node.elements, "=", nextObj )
													}
												}
											}
											//if( //_DEBUG_REFERENCES )  {
											//	const a = ctx.next.node.elements;
											//	console.log( "Stack Dump:"
											//		, a?a.length:a
											//		, ctx.next.node.name
											//		, thisKey
											//		);
											//}
										} else {
											nextObj = nextObj[thisKey];
										}
										//_DEBUG_REFERENCES && console.log( "Doing next context??", p, context_stack.length, val.contains.length );
										ctx = ctx.next;
										p++;
									}
									//_DEBUG_REFERENCES && console.log( "Done with context stack...level", lvl, "p", p );
									if( p < pathlen )
										lvl = p-1;
									else lvl = p;
								}
								//_DEBUG_REFERENCES && console.log( "End of processing level:", lvl );
							}
							if( !nextObj ) {
								throw new Error( "Path did not resolve properly:" +  val.contains + " at " + idx + '(' + lvl + ')' );
							}
							obj = nextObj;
						}
						//_DEBUG_PARSING && console.log( "Resulting resolved object:", obj );
						//_DEBUG_PARSING_DETAILS && console.log( "SETTING MODE TO -3 (resolved -2)" );
						arrayType = -3;
						return obj;
					}
					if( val.className ) { 
						fp = localFromProtoTypes.get( val.className );
						if( !fp )
							fp = fromProtoTypes.get( val.className );
						val.className = null; 
						if( fp && fp.cb ) return fp.cb.call( val.contains ); 
					}
					return val.contains;
				default:
					console.log( "Unhandled value conversion.", val );
					break;
				}
			}

			function arrayPush() {
				//_DEBUG_PARSING && console.log( "PUSH TO ARRAY:", val );
				if( arrayType == -3 )  {
					//_DEBUG_PARSING && console.log(" Array type -3?", val.value_type, elements );
					if( val.value_type === VALUE_OBJECT ) {
						elements.push( val.contains );
					}
					arrayType = -1; // next one should be allowed?
					return;
				} //else
				//	console.log( "Finally a push that's not already pushed!", );
				switch( val.value_type ){
				case VALUE_EMPTY:
					elements.push( undefined );
					delete elements[elements.length-1];
					break;
				default:
					elements.push( convertValue() );
					break;
				}
				RESET_VAL();
			}

			function objectPush() {
				if( arrayType === -3 && val.value_type === VALUE_ARRAY ) {
					//console.log( "Array has already been set in object." );
					//elements[val.name] = val.contains;
					RESET_VAL();
					arrayType = -1;
					return;
				}
				if( val.value_type === VALUE_EMPTY ) return;
				if( !val.name && current_class ) {
					//_DEBUG_PARSING_DETAILS && console.log( "A Stepping current class field:", current_class_field, val.name );
					val.name = current_class.fields[current_class_field++];
				}
				let value = convertValue();

				if( current_proto && current_proto.protoDef && current_proto.protoDef.cb ) {
					//_DEBUG_PARSING_DETAILS && console.log( "SOMETHING SHOULD AHVE BEEN REPLACED HERE??", current_proto );
					//_DEBUG_PARSING_DETAILS && console.log( "(need to do fromprototoypes here) object:", val, value );
					value = current_proto.protoDef.cb.call( elements, val.name, value );
					if( value ) elements[val.name] = value;
					//elements = new current_proto.protoCon( elements );
				}else {
				        //_DEBUG_PARSING_DETAILS && console.log( "Default no special class reviver", val.name, value );
					elements[val.name] = value;
				}
				//_DEBUG_PARSING_DETAILS && console.log( "Updated value:", current_class_field, val.name, elements[val.name] );
			
				//_DEBUG_PARSING && console.log( "+++ Added object field:", val.name, elements, elements[val.name], rootObject );
				RESET_VAL();
			}

			function recoverIdent(cInt) {
				//_DEBUG_PARSING&&console.log( "Recover Ident char:", cInt, val, String.fromCodePoint(cInt), "word:", word );
				if( word !== WORD_POS_RESET ) {
					if( negative ) { 
						//val.string += "-"; negative = false; 
						throwError( "Negative outside of quotes, being converted to a string (would lose count of leading '-' characters)", cInt );
					}
					switch( word ) {
					case WORD_POS_END:
						switch( val.value_type ) {
						case VALUE_TRUE:  val.string += "true"; break
						case VALUE_FALSE:  val.string += "false"; break
						case VALUE_NULL:  val.string += "null"; break
						case VALUE_INFINITY:  val.string += "Infinity"; break
						case VALUE_NEG_INFINITY:  val.string += "-Infinity"; throwError( "Negative outside of quotes, being converted to a string", cInt ); break
						case VALUE_NAN:  val.string += "NaN"; break
						case VALUE_NEG_NAN:  val.string += "-NaN"; throwError( "Negative outside of quotes, being converted to a string", cInt ); break
						case VALUE_UNDEFINED:  val.string += "undefined"; break
						case VALUE_STRING: break;
						case VALUE_UNSET: break;
						default:
							console.log( "Value of type " + val.value_type + " is not restored..." );
						}
						break;
					case WORD_POS_TRUE_1 :  val.string += "t"; break;
					case WORD_POS_TRUE_2 :  val.string += "tr"; break;
					case WORD_POS_TRUE_3 : val.string += "tru"; break;
					case WORD_POS_FALSE_1 : val.string += "f"; break;
					case WORD_POS_FALSE_2 : val.string += "fa"; break;
					case WORD_POS_FALSE_3 : val.string += "fal"; break;
					case WORD_POS_FALSE_4 : val.string += "fals"; break;
					case WORD_POS_NULL_1 : val.string += "n"; break;
					case WORD_POS_NULL_2 : val.string += "nu"; break;
					case WORD_POS_NULL_3 : val.string += "nul"; break;
					case WORD_POS_UNDEFINED_1 : val.string += "u"; break;
					case WORD_POS_UNDEFINED_2 : val.string += "un"; break;
					case WORD_POS_UNDEFINED_3 : val.string += "und"; break;
					case WORD_POS_UNDEFINED_4 : val.string += "unde"; break;
					case WORD_POS_UNDEFINED_5 : val.string += "undef"; break;
					case WORD_POS_UNDEFINED_6 : val.string += "undefi"; break;
					case WORD_POS_UNDEFINED_7 : val.string += "undefin"; break;
					case WORD_POS_UNDEFINED_8 : val.string += "undefine"; break;
					case WORD_POS_NAN_1 : val.string += "M"; break;
					case WORD_POS_NAN_2 : val.string += "Na"; break;
					case WORD_POS_INFINITY_1 : val.string += "I"; break;
					case WORD_POS_INFINITY_2 : val.string += "In"; break;
					case WORD_POS_INFINITY_3 : val.string += "Inf"; break;
					case WORD_POS_INFINITY_4 : val.string += "Infi"; break;
					case WORD_POS_INFINITY_5 : val.string += "Infin"; break;
					case WORD_POS_INFINITY_6 : val.string += "Infini"; break;
					case WORD_POS_INFINITY_7 : val.string += "Infinit"; break;
					case WORD_POS_RESET : break;
					case WORD_POS_FIELD : break;
					case WORD_POS_AFTER_FIELD:
					    //throwError( "String-keyword recovery fail (after whitespace)", cInt);
					    break;
					case WORD_POS_AFTER_FIELD_VALUE:
					    throwError( "String-keyword recovery fail (after whitespace)", cInt );
					    break;
						//console.log( "Word context: " + word + " unhandled" );
					}
					val.value_type = VALUE_STRING;									
					if( word < WORD_POS_FIELD)
					    word = WORD_POS_END;
				} else {
					word = WORD_POS_END;
					//if( val.value_type === VALUE_UNSET && val.string.length )
						val.value_type = VALUE_STRING;
				}
				if( cInt == 123/*'{'*/ )
					openObject();
				else if( cInt == 91/*'['*/ )
					openArray();
				else if( cInt == 44/*','*/ ) ; else {
					// ignore white space.
					if( cInt == 32/*' '*/ || cInt == 13 || cInt == 10 || cInt == 9 || cInt == 0xFEFF || cInt == 0x2028 || cInt == 0x2029 ) {
						//_DEBUG_WHITESPACE && console.log( "IGNORE WHITESPACE" );
						return;
					}

					if( cInt == 44/*','*/ || cInt == 125/*'}'*/ || cInt == 93/*']'*/ || cInt == 58/*':'*/ )
						throwError( "Invalid character near identifier", cInt );
					else //if( typeof cInt === "number")
						val.string += str;
				}
				//console.log( "VAL STRING IS:", val.string, str );
			}

			function gatherString( start_c ) {
				let retval = 0;
				while( retval == 0 && ( n < buf.length ) ) {
					str = buf.charAt(n);
					let cInt = buf.codePointAt(n++);
					if( cInt >= 0x10000 ) { str += buf.charAt(n); n++; }
					//console.log( "gathering....", stringEscape, str, cInt, unicodeWide, stringHex, stringUnicode, hex_char_len );
					pos.col++;
					if( cInt == start_c ) { //( cInt == 34/*'"'*/ ) || ( cInt == 39/*'\''*/ ) || ( cInt == 96/*'`'*/ ) )
						if( stringEscape ) { 
							if( stringHex )
								throwError( "Incomplete hexidecimal sequence", cInt );
							else if( stringUnicode )
								throwError( "Incomplete long unicode sequence", cInt );
							else if( unicodeWide )
								throwError( "Incomplete unicode sequence", cInt );
							if( cr_escaped ) {
								cr_escaped = false;
								retval = 1; // complete string, escaped \r
							} else val.string += str;
							stringEscape = false; }
						else {
							// quote matches, and is not processing an escape sequence.
							retval = 1;
						}
					}

					else if( stringEscape ) {
						if( unicodeWide ) {
							if( cInt == 125/*'}'*/ ) {
								val.string += String.fromCodePoint( hex_char );
								unicodeWide = false;
								stringUnicode = false;
								stringEscape = false;
								continue;
							}
							hex_char *= 16;
							if( cInt >= 48/*'0'*/ && cInt <= 57/*'9'*/ )      hex_char += cInt - 0x30;
							else if( cInt >= 65/*'A'*/ && cInt <= 70/*'F'*/ ) hex_char += ( cInt - 65 ) + 10;
							else if( cInt >= 97/*'a'*/ && cInt <= 102/*'f'*/ ) hex_char += ( cInt - 97 ) + 10;
							else {
								throwError( "(escaped character, parsing hex of \\u)", cInt );
								retval = -1;
								unicodeWide = false;
								stringEscape = false;
								continue;
							}
							continue;
						}
						else if( stringHex || stringUnicode ) {
							if( hex_char_len === 0 && cInt === 123/*'{'*/ ) {
								unicodeWide = true;
								continue;
							}
							if( hex_char_len < 2 || ( stringUnicode && hex_char_len < 4 ) ) {
								hex_char *= 16;
								if( cInt >= 48/*'0'*/ && cInt <= 57/*'9'*/ )      hex_char += cInt - 0x30;
								else if( cInt >= 65/*'A'*/ && cInt <= 70/*'F'*/ ) hex_char += ( cInt - 65 ) + 10;
								else if( cInt >= 97/*'a'*/ && cInt <= 102/*'f'*/ ) hex_char += ( cInt - 97 ) + 10;
								else {
									throwError( stringUnicode?"(escaped character, parsing hex of \\u)":"(escaped character, parsing hex of \\x)", cInt );
									retval = -1;
									stringHex = false;
									stringEscape = false;
									continue;
								}
								hex_char_len++;
								if( stringUnicode ) {
									if( hex_char_len == 4 ) {
										val.string += String.fromCodePoint( hex_char );
										stringUnicode = false;
										stringEscape = false;
									}
								}
								else if( hex_char_len == 2 ) {
									val.string += String.fromCodePoint( hex_char );
									stringHex = false;
									stringEscape = false;
								}
								continue;
							}
						}
						switch( cInt ) {
						case 13/*'\r'*/:
							cr_escaped = true;
							pos.col = 1;
							continue;
						case 0x2028: // LS (Line separator)
						case 0x2029: // PS (paragraph separate)
							pos.col = 1;
							// falls through
						case 10/*'\n'*/:
							if( !cr_escaped ) { // \\ \n
								pos.col = 1;
							} else { // \\ \r \n
								cr_escaped = false;
							}
							pos.line++;
							break;
						case 116/*'t'*/:
							val.string += '\t';
							break;
						case 98/*'b'*/:
							val.string += '\b';
							break;
						case 110/*'n'*/:
							val.string += '\n';
							break;
						case 114/*'r'*/:
							val.string += '\r';
							break;
						case 102/*'f'*/:
							val.string += '\f';
							break;
						case 48/*'0'*/: 
							val.string += '\0';
							break;
						case 120/*'x'*/:
							stringHex = true;
							hex_char_len = 0;
							hex_char = 0;
							continue;
						case 117/*'u'*/:
							stringUnicode = true;
							hex_char_len = 0;
							hex_char = 0;
							continue;
						//case 47/*'/'*/:
						//case 92/*'\\'*/:
						//case 34/*'"'*/:
						//case 39/*"'"*/:
						//case 96/*'`'*/:
						default:
							val.string += str;
							break;
						}
						//console.log( "other..." );
						stringEscape = false;
					}
					else if( cInt === 92/*'\\'*/ ) {
						if( stringEscape ) {
							val.string += '\\';
							stringEscape = false;
						}
						else {
							stringEscape = true;
							hex_char = 0;
							hex_char_len = 0;
						}
					}
					else { /* any other character */
						if( cr_escaped ) {
							// \\ \r <any char>
							cr_escaped = false;
							pos.line++;
							pos.col = 2; // this character is pos 1; and increment to be after it.
						}
						val.string += str;
					}
				}
				return retval;
			}

			function collectNumber() {
				let _n;
				while( (_n = n) < buf.length ) {
					str = buf.charAt(_n);
					let cInt = buf.codePointAt(n++);
					if( cInt >= 256 ) { 
							n = _n; // put character back in queue to process.
							break;
					} else {
						//_DEBUG_PARSING_NUMBERS  && console.log( "in getting number:", n, cInt, String.fromCodePoint(cInt) );
						if( cInt == 95 /*_*/ )
							continue;
						pos.col++;
						// leading zeros should be forbidden.
						if( cInt >= 48/*'0'*/ && cInt <= 57/*'9'*/ ) {
							if( exponent ) {
								exponent_digit = true;
							}
							val.string += str;
						} else if( cInt == 45/*'-'*/ || cInt == 43/*'+'*/ ) {
							if( val.string.length == 0 || ( exponent && !exponent_sign && !exponent_digit ) ) {
								if( cInt == 45/*'-'*/ && !exponent ) negative = !negative;
								val.string += str;
								exponent_sign = true;
							} else {
								val.string += str;
								date_format = true;
							}
						} else if( cInt == 78/*'N'*/ ) {
							if( word == WORD_POS_RESET ) {
								gatheringNumber = false;
								word = WORD_POS_NAN_1;
								return;
							}
							throwError( "fault while parsing number;", cInt );
							break;
						} else if( cInt == 73/*'I'*/ ) {
							if( word == WORD_POS_RESET ) {
								gatheringNumber = false;
								word = WORD_POS_INFINITY_1;
								return;
							}
							throwError( "fault while parsing number;", cInt );
							break;
						} else if( cInt == 58/*':'*/ && date_format ) {
							val.string += str;
							date_format = true;
						} else if( cInt == 84/*'T'*/ && date_format ) {
							val.string += str;
							date_format = true;
						} else if( cInt == 90/*'Z'*/ && date_format ) {
							val.string += str;
							date_format = true;
						} else if( cInt == 46/*'.'*/ ) {
							if( !decimal && !fromHex && !exponent ) {
								val.string += str;
								decimal = true;
							} else {
								status = false;
								throwError( "fault while parsing number;", cInt );
								break;
							}
						} else if( cInt == 110/*'n'*/ ) {
							isBigInt = true;
							break;
						} else if( cInt == 120/*'x'*/ || cInt == 98/*'b'*/ || cInt == 111/*'o'*/
								|| cInt == 88/*'X'*/ || cInt == 66/*'B'*/ || cInt == 79/*'O'*/ ) {
							// hex conversion.
							if( !fromHex && val.string == '0' ) {
								fromHex = true;
								val.string += str;
							}
							else {
								status = false;
								throwError( "fault while parsing number;", cInt );
								break;
							}
						} else if( ( cInt == 101/*'e'*/ ) || ( cInt == 69/*'E'*/ ) ) {
							if( !exponent ) {
								val.string += str;
								exponent = true;
							} else {
								status = false;
								throwError( "fault while parsing number;", cInt );
								break;
							}
						} else {
							if( cInt == 32/*' '*/ || cInt == 13 || cInt == 10 || cInt == 9 || cInt == 47/*'/'*/ || cInt ==  35/*'#'*/
							 || cInt == 44/*','*/ || cInt == 125/*'}'*/ || cInt == 93/*']'*/
							 || cInt == 123/*'{'*/ || cInt == 91/*'['*/ || cInt == 34/*'"'*/ || cInt == 39/*'''*/ || cInt == 96/*'`'*/
							 || cInt == 58/*':'*/ ) {
								n = _n; // put character back in queue to process.
								break;
							}
							else {
								if( complete_at_end ) {
									status = false;
									throwError( "fault while parsing number;", cInt );
								}
								break;
							}
						}
					}
				}
				if( (!complete_at_end) && n == buf.length ) {
					gatheringNumber = true;
				}
				else {
					gatheringNumber = false;
					val.value_type = VALUE_NUMBER;
					if( parse_context == CONTEXT_UNKNOWN ) {
						completed = true;
					}
				}
			}

			function openObject() {
				let nextMode = CONTEXT_OBJECT_FIELD;
				let cls = null;
				let tmpobj = {};
				//_DEBUG_PARSING && console.log( "opening object:", val.string, val.value_type, word, parse_context );
				if( word > WORD_POS_RESET && word < WORD_POS_FIELD )
					recoverIdent( 123 /* '{' */ );
				let protoDef;
				protoDef = getProto(); // lookup classname using val.string and get protodef(if any)
				if( parse_context == CONTEXT_UNKNOWN ) {
					if( word == WORD_POS_FIELD /*|| word == WORD_POS_AFTER_FIELD*/ 
					   || word == WORD_POS_END
					     && ( protoDef || val.string.length ) ) {
							if( protoDef && protoDef.protoDef && protoDef.protoDef.protoCon ) {
								tmpobj = new protoDef.protoDef.protoCon();
							}
						if( !protoDef || !protoDef.protoDef && val.string ) // class creation is redundant...
						{
							cls = classes.find( cls=>cls.name===val.string );
							console.log( "Probably creating the Macro-Tag here?", cls );
							if( !cls ) {
								/* eslint-disable no-inner-declarations */
								function privateProto() {} 
								// this just uses the tmpobj {} container to store the values collected for this class...
								// this does not generate the instance of the class.
								// if this tag type is also a prototype, use that prototype, else create a unique proto
								// for this tagged class type.
								classes.push( cls = { name : val.string
								, protoCon: (protoDef && protoDef.protoDef && protoDef.protoDef.protoCon) || privateProto.constructor
								 , fields : [] } );
								 nextMode = CONTEXT_CLASS_FIELD;
							} else if( redefineClass ) {
								//_DEBUG_PARSING && console.log( "redefine class..." );
								// redefine this class
								cls.fields.length = 0;
								nextMode = CONTEXT_CLASS_FIELD;
							} else {
								//_DEBUG_PARSING && console.log( "found existing class, using it....");
								tmpobj = new cls.protoCon();
								//tmpobj = Object.assign( tmpobj, cls.protoObject );
								//Object.setPrototypeOf( tmpobj, Object.getPrototypeOf( cls.protoObject ) );
								nextMode = CONTEXT_CLASS_VALUE;
							}
							redefineClass = false;
						}
						current_class = cls;
						word = WORD_POS_RESET;
					} else {
						word = WORD_POS_FIELD;
					}
				} else if( word == WORD_POS_FIELD /*|| word == WORD_POS_AFTER_FIELD*/ 
						|| parse_context === CONTEXT_IN_ARRAY 
						|| parse_context === CONTEXT_OBJECT_FIELD_VALUE 
						|| parse_context == CONTEXT_CLASS_VALUE ) {
					if( word != WORD_POS_RESET || val.value_type == VALUE_STRING ) {
						if( protoDef && protoDef.protoDef ) {
							// need to collect the object,
							tmpobj = new protoDef.protoDef.protoCon();
						} else {
							// look for a class type (shorthand) to recover.
							cls = classes.find( cls=>cls.name === val.string );
							if( !cls )
							{
								/* eslint-disable no-inner-declarations */
							   function privateProto(){}
								//sconsole.log( "privateProto has no proto?", privateProto.prototype.constructor.name );
								localFromProtoTypes.set( val.string,
														{ protoCon:privateProto.prototype.constructor
														, cb: null }
													   );
								tmpobj = new privateProto();
							}
							else {
								nextMode = CONTEXT_CLASS_VALUE;
								tmpobj = {};
							}
						}
						//nextMode = CONTEXT_CLASS_VALUE;
						word = WORD_POS_RESET;
					} else {
						word = WORD_POS_RESET;
					}
				} else if( ( parse_context == CONTEXT_OBJECT_FIELD && word == WORD_POS_RESET ) ) {
					throwError( "fault while parsing; getting field name unexpected ", cInt );
					status = false;
					return false;
				}

				// common code to push into next context
				let old_context = getContext();
				//_DEBUG_PARSING && console.log( "Begin a new object; previously pushed into elements; but wait until trailing comma or close previously ", val.value_type, val.className );

				val.value_type = VALUE_OBJECT;
				if( parse_context === CONTEXT_UNKNOWN ){
					elements = tmpobj;
				} else if( parse_context == CONTEXT_IN_ARRAY ) ; else if( parse_context == CONTEXT_OBJECT_FIELD_VALUE || parse_context == CONTEXT_CLASS_VALUE ) {
					if( !val.name && current_class ){
						val.name = current_class.fields[current_class_field++];
						//_DEBUG_PARSING_DETAILS && console.log( "B Stepping current class field:", val, current_class_field, val.name );
					}
					//_DEBUG_PARSING_DETAILS && console.log( "Setting element:", val.name, tmpobj );
					elements[val.name] = tmpobj;
				}

				old_context.context = parse_context;
				old_context.elements = elements;
				//old_context.element_array = element_array;
				old_context.name = val.name;
				//_DEBUG_PARSING_DETAILS && console.log( "pushing val.name:", val.name, arrayType );
				old_context.current_proto = current_proto;
				old_context.current_class = current_class;
				old_context.current_class_field = current_class_field;
				old_context.valueType = val.value_type;
				old_context.arrayType = arrayType; // pop that we don't want to have this value re-pushed.
				old_context.className = val.className;
				//arrayType = -3; // this doesn't matter, it's an object state, and a new array will reset to -1
				val.className = null;
				val.name = null;
				current_proto = protoDef;
				current_class = cls;
				//console.log( "Setting current class:", current_class.name );
				current_class_field = 0;
				elements = tmpobj;
				if( !rootObject ) rootObject = elements;
				//_DEBUG_PARSING_STACK && console.log( "push context (open object): ", context_stack.length, " new mode:", nextMode );
				context_stack.push( old_context );
				//_DEBUG_PARSING_DETAILS && console.log( "RESET OBJECT FIELD", old_context, context_stack );
				RESET_VAL();
				parse_context = nextMode;
				return true;
			}

			function openArray() {
				//_DEBUG_PARSING_DETAILS && console.log( "openArray()..." );
				if( word > WORD_POS_RESET && word < WORD_POS_FIELD )
					recoverIdent( 91 );

				if( word == WORD_POS_END && val.string.length ) {
					//_DEBUG_PARSING && console.log( "recover arrayType:", arrayType, val.string );
					let typeIndex = knownArrayTypeNames.findIndex( type=>(type === val.string) );
					if( typeIndex >= 0 ) {
						word = WORD_POS_RESET;
						arrayType = typeIndex;
						val.className = val.string;
						val.string = null;
					} else {
						if( val.string === "ref" ) {
							val.className = null;
							//_DEBUG_PARSING_DETAILS && console.log( "This will be a reference recovery for key:", val );
							arrayType = -2;
						} else {
							if( localFromProtoTypes.get( val.string ) ) {
								val.className = val.string;
							} 
							else if( fromProtoTypes.get( val.string ) ) {
								val.className = val.string;
							} else
								throwError( `Unknown type '${val.string}' specified for array`, cInt );
							//_DEBUG_PARSING_DETAILS && console.log( " !!!!!A Set Classname:", val.className );
						}
					}
				} else if( parse_context == CONTEXT_OBJECT_FIELD || word == WORD_POS_FIELD || word == WORD_POS_AFTER_FIELD ) {
					throwError( "Fault while parsing; while getting field name unexpected", cInt );
					status = false;
					return false;
				}
				{
					let old_context = getContext();
					//_DEBUG_PARSING && console.log( "Begin a new array; previously pushed into elements; but wait until trailing comma or close previously ", val.value_type );

					//_DEBUG_PARSING_DETAILS && console.log( "Opening array:", val, parse_context );
					val.value_type = VALUE_ARRAY;
					let tmparr = [];
					if( parse_context == CONTEXT_UNKNOWN )
						elements = tmparr;
					else if( parse_context == CONTEXT_IN_ARRAY ) {
						if( arrayType == -1 ){
							//console.log( "Pushing new opening array into existing array already RE-SET" );
							elements.push( tmparr );
						} //else if( //_DEBUG_PARSING && arrayType !== -3 )
						//	console.log( "This is an invalid parsing state, typed array with sub-array elements" );
					} else if( parse_context == CONTEXT_OBJECT_FIELD_VALUE ) {
						if( !val.name ) {
							console.log( "This says it's resolved......." );
							arrayType = -3;
						}

						if( current_proto && current_proto.protoDef ) {
							//_DEBUG_PARSING_DETAILS && console.log( "SOMETHING SHOULD HAVE BEEN REPLACED HERE??", current_proto );
							//_DEBUG_PARSING_DETAILS && console.log( "(need to do fromprototoypes here) object:", val, value );
							if( current_proto.protoDef.cb ){
								const newarr = current_proto.protoDef.cb.call( elements, val.name, tmparr );
								if( newarr !== undefined ) tmparr = elements[val.name] = newarr;
								else console.log( "Warning: Received undefined for an array; keeping original array, not setting field" );
							}else
								elements[val.name] = tmparr;
						}
						else
							elements[val.name] = tmparr;
					}
					old_context.context = parse_context;
					old_context.elements = elements;
					//old_context.element_array = element_array;
					old_context.name = val.name;
					old_context.current_proto = current_proto;
					old_context.current_class = current_class;
					old_context.current_class_field = current_class_field;
					// already pushed?
					old_context.valueType = val.value_type;
					old_context.arrayType = (arrayType==-1)?-3:arrayType; // pop that we don't want to have this value re-pushed.
					old_context.className = val.className;
					arrayType = -1;
					val.className = null;

					//_DEBUG_PARSING_DETAILS && console.log( " !!!!!B Clear Classname:", old_context, val.className, old_context.className, old_context.name );
					val.name = null;
					current_proto = null;
					current_class = null;
					current_class_field = 0;
					//element_array = tmparr;
					elements = tmparr;
					if( !rootObject ) rootObject = tmparr;
					//_DEBUG_PARSING_STACK && console.log( "push context (open array): ", context_stack.length );
					context_stack.push( old_context );
					//_DEBUG_PARSING_DETAILS && console.log( "RESET ARRAY FIELD", old_context, context_stack );

					RESET_VAL();
					parse_context = CONTEXT_IN_ARRAY;
				}
				return true;
			}

			function getProto() {
				const result = {protoDef:null,cls:null};
				if( ( result.protoDef = localFromProtoTypes.get( val.string ) ) ) {
					if( !val.className ){
						val.className = val.string;
						val.string = null;
					}
					// need to collect the object, 
				}
				else if( ( result.protoDef = fromProtoTypes.get( val.string ) ) ) {
					if( !val.className ){
						val.className = val.string;
						val.string = null;
					}
				} 
				if( val.string )
				{
					result.cls = classes.find( cls=>cls.name === val.string );
				}
				return (result.protoDef||result.cls)?result:null;
			}

			if( !status )
				return -1;

			if( msg && msg.length ) {
				input = getBuffer();
				input.buf = msg;
				inQueue.push( input );
			} else {
				if( gatheringNumber ) {
					//console.log( "Force completed.")
					gatheringNumber = false;
					val.value_type = VALUE_NUMBER;
					if( parse_context == CONTEXT_UNKNOWN ) {
						completed = true;
					}
					retval = 1;  // if returning buffers, then obviously there's more in this one.
				}
				if( parse_context !== CONTEXT_UNKNOWN )
					throwError( "Unclosed object at end of stream.", cInt );
			}

			while( status && ( input = inQueue.shift() ) ) {
				n = input.n;
				buf = input.buf;
				if( gatheringString ) {
					let string_status = gatherString( gatheringStringFirstChar );
					if( string_status < 0 )
						status = false;
					else if( string_status > 0 ) {
						gatheringString = false;
						if( status ) val.value_type = VALUE_STRING;
					}
				}
				if( gatheringNumber ) {
					collectNumber();
				}

				while( !completed && status && ( n < buf.length ) ) {
					str = buf.charAt(n);
					cInt = buf.codePointAt(n++);
					if( cInt >= 0x10000 ) { str += buf.charAt(n); n++; }
					//_DEBUG_PARSING && console.log( "parsing at ", cInt, str );
					//_DEBUG_LL && console.log( "processing: ", cInt, n, str, pos, comment, parse_context, word );
					pos.col++;
					if( comment ) {
						if( comment == 1 ) {
							if( cInt == 42/*'*'*/ ) comment = 3;
							else if( cInt != 47/*'/'*/ ) return throwError( "fault while parsing;", cInt );
							else comment = 2;
						}
						else if( comment == 2 ) {
							if( cInt == 10/*'\n'*/ || cInt == 13/*'\r'*/  ) comment = 0;
						}
						else if( comment == 3 ) {
							if( cInt == 42/*'*'*/ ) comment = 4;
						}
						else {
							if( cInt == 47/*'/'*/ ) comment = 0;
							else comment = 3;
						}
						continue;
					}
					switch( cInt ) {
					case 47/*'/'*/:
						comment = 1;
						break;
					case 123/*'{'*/:
						openObject();
						break;
					case 91/*'['*/:
						openArray();
						break;

					case 58/*':'*/:
						//_DEBUG_PARSING && console.log( "colon received...")
						if( parse_context == CONTEXT_CLASS_VALUE ) {
							word = WORD_POS_RESET;
							val.name = val.string;
							val.string = '';
							val.value_type = VALUE_UNSET;
							
						} else if( parse_context == CONTEXT_OBJECT_FIELD
							|| parse_context == CONTEXT_CLASS_FIELD  ) {
							if( parse_context == CONTEXT_CLASS_FIELD ) {
								if( !Object.keys( elements).length ) {
									 console.log( "This is a full object, not a class def...", val.className );
								const privateProto = ()=>{}; 
								localFromProtoTypes.set( context_stack.last.node.current_class.name,
														{ protoCon:privateProto.prototype.constructor
														, cb: null }
													   );
								elements = new privateProto();
								parse_context = CONTEXT_OBJECT_FIELD_VALUE;
								val.name = val.string;
								word = WORD_POS_RESET;
								val.string = '';
								val.value_type = VALUE_UNSET;
								console.log( "don't do default;s do a revive..." );
								}
							} else {
								if( word != WORD_POS_RESET
								   && word != WORD_POS_END
								   && word != WORD_POS_FIELD
								   && word != WORD_POS_AFTER_FIELD ) {
									recoverIdent( 32 );
									// allow starting a new word
									//status = false;
									//throwError( `fault while parsing; unquoted keyword used as object field name (state:${word})`, cInt );
									//break;
								}
								word = WORD_POS_RESET;
								val.name = val.string;
								val.string = '';
								parse_context = (parse_context===CONTEXT_OBJECT_FIELD)?CONTEXT_OBJECT_FIELD_VALUE:CONTEXT_CLASS_FIELD_VALUE;
								val.value_type = VALUE_UNSET;
							}
						}
						else if( parse_context == CONTEXT_UNKNOWN ){
							console.log( "Override colon found, allow class redefinition", parse_context );
							redefineClass = true;
							break;
						} else {
							if( parse_context == CONTEXT_IN_ARRAY )
								throwError(  "(in array, got colon out of string):parsing fault;", cInt );
							else if( parse_context == CONTEXT_OBJECT_FIELD_VALUE ){
								throwError( "String unexpected", cInt );
							} else
								throwError( "(outside any object, got colon out of string):parsing fault;", cInt );
							status = false;
						}
						break;
					case 125/*'}'*/:
						//_DEBUG_PARSING && console.log( "close bracket context:", word, parse_context, val.value_type, val.string );
						if( word == WORD_POS_END ) {
							// allow starting a new word
							word = WORD_POS_RESET;
						}
						// coming back after pushing an array or sub-object will reset the contxt to FIELD, so an end with a field should still push value.
						if( parse_context == CONTEXT_CLASS_FIELD ) {
							if( current_class ) {
								// allow blank comma at end to not be a field
								if(val.string) { current_class.fields.push( val.string ); }

								RESET_VAL();
								let old_context = context_stack.pop();
								//_DEBUG_PARSING_DETAILS && console.log( "close object:", old_context, context_stack );
								//_DEBUG_PARSING_STACK && console.log( "object pop stack (close obj)", context_stack.length, old_context );
								parse_context = CONTEXT_UNKNOWN; // this will restore as IN_ARRAY or OBJECT_FIELD
								word = WORD_POS_RESET;
								val.name = old_context.name;
								elements = old_context.elements;
								//element_array = old_context.element_array;
								current_class = old_context.current_class;
								current_class_field = old_context.current_class_field;
								//_DEBUG_PARSING_DETAILS && console.log( "A Pop old class field counter:", current_class_field, val.name );
								arrayType = old_context.arrayType;
								val.value_type = old_context.valueType;
								val.className = old_context.className;
								//_DEBUG_PARSING_DETAILS && console.log( " !!!!!C Pop Classname:", val.className );
								rootObject = null;

								dropContext( old_context );
							} else {
								throwError( "State error; gathering class fields, and lost the class", cInt );
							}
						} else if( ( parse_context == CONTEXT_OBJECT_FIELD ) || ( parse_context == CONTEXT_CLASS_VALUE ) ) {
							if( val.value_type != VALUE_UNSET ) {
								if( current_class ) {
									//_DEBUG_PARSING_DETAILS && console.log( "C Stepping current class field:", current_class_field, val.name, arrayType );
									val.name = current_class.fields[current_class_field++];
								}
								//_DEBUG_PARSING && console.log( "Closing object; set value name, and push...", current_class_field, val );
								objectPush();
							}
							//_DEBUG_PARSING && console.log( "close object; empty object", val, elements );

								val.value_type = VALUE_OBJECT;
								if( current_proto && current_proto.protoDef ) {
									console.log( "SOMETHING SHOULD AHVE BEEN REPLACED HERE??", current_proto );
									console.log( "The other version only revives on init" );
									elements = new current_proto.protoDef.cb( elements, undefined, undefined );
									//elements = new current_proto.protoCon( elements );
								}
								val.contains = elements;
								val.string = "";

							let old_context = context_stack.pop();
							//_DEBUG_PARSING_STACK && console.log( "object pop stack (close obj)", context_stack.length, old_context );
							parse_context = old_context.context; // this will restore as IN_ARRAY or OBJECT_FIELD
							val.name = old_context.name;
							elements = old_context.elements;
							//element_array = old_context.element_array;
							current_class = old_context.current_class;
							current_proto = old_context.current_proto;
							current_class_field = old_context.current_class_field;
							//_DEBUG_PARSING_DETAILS && console.log( "B Pop old class field counter:", context_stack, current_class_field, val.name );
							arrayType = old_context.arrayType;
							val.value_type = old_context.valueType;
							val.className = old_context.className;
							//_DEBUG_PARSING_DETAILS && console.log( " !!!!!D Pop Classname:", val.className );
							dropContext( old_context );

							if( parse_context == CONTEXT_UNKNOWN ) {
								completed = true;
							}
						}
						else if( ( parse_context == CONTEXT_OBJECT_FIELD_VALUE ) ) {
							// first, add the last value
							//_DEBUG_PARSING && console.log( "close object; push item '%s' %d", val.name, val.value_type );
							if( val.value_type === VALUE_UNSET ) {
								throwError( "Fault while parsing; unexpected", cInt );
							}
							objectPush();
							val.value_type = VALUE_OBJECT;
							val.contains = elements;
							word = WORD_POS_RESET;

							//let old_context = context_stack.pop();
							let old_context = context_stack.pop();
							//_DEBUG_PARSING_STACK  && console.log( "object pop stack (close object)", context_stack.length, old_context );
							parse_context = old_context.context; // this will restore as IN_ARRAY or OBJECT_FIELD
							val.name = old_context.name;
							elements = old_context.elements;
							current_proto = old_context.current_proto;
							current_class = old_context.current_class;
							current_class_field = old_context.current_class_field;
							//_DEBUG_PARSING_DETAILS && console.log( "C Pop old class field counter:", context_stack, current_class_field, val.name );
							arrayType = old_context.arrayType;
							val.value_type = old_context.valueType;
							val.className = old_context.className;
							//_DEBUG_PARSING_DETAILS && console.log( " !!!!!E Pop Classname:", val.className );
							//element_array = old_context.element_array;
							dropContext( old_context );
							if( parse_context == CONTEXT_UNKNOWN ) {
								completed = true;
							}
						}
						else {
							throwError( "Fault while parsing; unexpected", cInt );
							status = false;
						}
						negative = false;
						break;
					case 93/*']'*/:
						if( word >= WORD_POS_AFTER_FIELD ) {
							word = WORD_POS_RESET;
						}
						if( parse_context == CONTEXT_IN_ARRAY ) {
							
							//_DEBUG_PARSING  && console.log( "close array, push last element: %d", val.value_type );
							if( val.value_type != VALUE_UNSET ) {
								if( val.name ) console.log( "Ya this should blow up" );
								arrayPush();
							}
							val.contains = elements;
							{
								let old_context = context_stack.pop();
								//_DEBUG_PARSING_STACK  && console.log( "object pop stack (close array)", context_stack.length );
								val.name = old_context.name;
								val.className = old_context.className;
								parse_context = old_context.context;
								elements = old_context.elements;
								//element_array = old_context.element_array;
								current_proto = old_context.current_proto;
								current_class = old_context.current_class;
								current_class_field = old_context.current_class_field;
								arrayType = old_context.arrayType;
								val.value_type = old_context.valueType;
								//_DEBUG_PARSING_DETAILS && console.log( "close array:", old_context );
								//_DEBUG_PARSING_DETAILS && console.log( "D Pop old class field counter:", context_stack, current_class_field, val );
								dropContext( old_context );
							}
							val.value_type = VALUE_ARRAY;
							if( parse_context == CONTEXT_UNKNOWN ) {
								completed = true;
							}
						} else {
							throwError( `bad context ${parse_context}; fault while parsing`, cInt );// fault
							status = false;
						}
						negative = false;
						break;
					case 44/*','*/:
						if( word < WORD_POS_AFTER_FIELD && word != WORD_POS_RESET ) {
							recoverIdent(cInt);
						}
						if( word == WORD_POS_END || word == WORD_POS_FIELD ) word = WORD_POS_RESET;  // allow collect new keyword
						//if(//_DEBUG_PARSING) 
						//_DEBUG_PARSING_DETAILS && console.log( "comma context:", parse_context, val );
						if( parse_context == CONTEXT_CLASS_FIELD ) {
							if( current_class ) {
								console.log( "Saving field name(set word to IS A FIELD):", val.string );
								current_class.fields.push( val.string );
								val.string = '';
								word = WORD_POS_FIELD;
							} else {
								throwError( "State error; gathering class fields, and lost the class", cInt );
							}
						} else if( parse_context == CONTEXT_OBJECT_FIELD ) {
							if( current_class ) {
								//_DEBUG_PARSING_DETAILS && console.log( "D Stepping current class field:", current_class_field, val.name );
								val.name = current_class.fields[current_class_field++];
								//_DEBUG_PARSING && console.log( "should have a completed value at a comma.:", current_class_field, val );
								if( val.value_type != VALUE_UNSET ) {
									//_DEBUG_PARSING  && console.log( "pushing object field:", val );
									objectPush();
									RESET_VAL();
								}
							} else {
								// this is an empty comma...
								if( val.string || val.value_type )
									throwError( "State error; comma in field name and/or lost the class", cInt );
							}
						} else if( parse_context == CONTEXT_CLASS_VALUE ) {
							if( current_class ) {
								//_DEBUG_PARSING_DETAILS && console.log( "reviving values in class...", arrayType, current_class.fields[current_class_field ], val );
								if( arrayType != -3 && !val.name ) {
									// this should have still had a name....
									//_DEBUG_PARSING_DETAILS && console.log( "E Stepping current class field:", current_class_field, val, arrayType );
									val.name = current_class.fields[current_class_field++];
									//else val.name = current_class.fields[current_class_field++];
								}
								//_DEBUG_PARSING && console.log( "should have a completed value at a comma.:", current_class_field, val );
								if( val.value_type != VALUE_UNSET ) {
									if( arrayType != -3 )
										objectPush();
									RESET_VAL();
								}
							} else {
								
								if( val.value_type != VALUE_UNSET ) {
									objectPush();
									RESET_VAL();
								}
								//throwError( "State error; gathering class values, and lost the class", cInt );
							}
							val.name = null;
						} else if( parse_context == CONTEXT_IN_ARRAY ) {
							if( val.value_type == VALUE_UNSET )
								val.value_type = VALUE_EMPTY; // in an array, elements after a comma should init as undefined...

							//_DEBUG_PARSING  && console.log( "back in array; push item %d", val.value_type );
							arrayPush();
							RESET_VAL();
							word = WORD_POS_RESET;
							// undefined allows [,,,] to be 4 values and [1,2,3,] to be 4 values with an undefined at end.
						} else if( parse_context == CONTEXT_OBJECT_FIELD_VALUE && val.value_type != VALUE_UNSET ) {
							// after an array value, it will have returned to OBJECT_FIELD anyway
							//_DEBUG_PARSING  && console.log( "comma after field value, push field to object: %s", val.name, val.value_type );
							parse_context = CONTEXT_OBJECT_FIELD;
							if( val.value_type != VALUE_UNSET ) {
								objectPush();
								RESET_VAL();
							}
							word = WORD_POS_RESET;
						} else {
							status = false;
							throwError( "bad context; excessive commas while parsing;", cInt );// fault
						}
						negative = false;
						break;

					default:
						switch( cInt ) {
						default:
						if( ( parse_context == CONTEXT_UNKNOWN )
						  || ( parse_context == CONTEXT_OBJECT_FIELD_VALUE && word == WORD_POS_FIELD )
						  || ( ( parse_context == CONTEXT_OBJECT_FIELD ) || word == WORD_POS_FIELD )
						  || ( parse_context == CONTEXT_CLASS_FIELD ) ) {
							switch( cInt ) {
							case 96://'`':
							case 34://'"':
							case 39://'\'':
								if( word == WORD_POS_RESET || word == WORD_POS_FIELD ) {
									if( val.string.length ) {
										console.log( "IN ARRAY AND FIXING?" );
										val.className = val.string;
										val.string = '';
									}
									let string_status = gatherString(cInt );
									//_DEBUG_PARSING && console.log( "string gather for object field name :", val.string, string_status );
									if( string_status ) {
										val.value_type = VALUE_STRING;
									} else {
										gatheringStringFirstChar = cInt;
										gatheringString = true;
									}
								} else {
									throwError( "fault while parsing; quote not at start of field name", cInt );
								}

								break;
							case 10://'\n':
								pos.line++;
								pos.col = 1;
								// fall through to normal space handling - just updated line/col position
							case 13://'\r':
							case 32://' ':
							case 0x2028://' ':
							case 0x2029://' ':
							case 9://'\t':
							case 0xFEFF: // ZWNBS is WS though
								 //_DEBUG_WHITESPACE  && console.log( "THIS SPACE", word, parse_context, val );
								if( parse_context === CONTEXT_UNKNOWN && word === WORD_POS_END ) { // allow collect new keyword
									word = WORD_POS_RESET;
									if( parse_context === CONTEXT_UNKNOWN ) {
										completed = true;
									}
									break;
								}
								if( word === WORD_POS_RESET || word === WORD_POS_AFTER_FIELD ) { // ignore leading and trailing whitepsace
									if( parse_context == CONTEXT_UNKNOWN && val.value_type ) {
										completed = true;
									}
									break;
								}
								else if( word === WORD_POS_FIELD ) {
									if( parse_context === CONTEXT_UNKNOWN ) {
										word = WORD_POS_RESET;
										completed = true;
										break;
									}
									if( val.string.length )
										console.log( "STEP TO NEXT TOKEN." );
										word = WORD_POS_AFTER_FIELD;
										//val.className = val.string; val.string = '';
								}
								else {
									status = false;
									throwError( "fault while parsing; whitepsace unexpected", cInt );
								}
								// skip whitespace
								break;
							default:
								//console.log( "TICK" );
								if( word == WORD_POS_RESET && ( ( cInt >= 48/*'0'*/ && cInt <= 57/*'9'*/ ) || ( cInt == 43/*'+'*/ ) || ( cInt == 46/*'.'*/ ) || ( cInt == 45/*'-'*/ ) ) ) {
									fromHex = false;
									exponent = false;
									date_format = false;
									isBigInt = false;

									exponent_sign = false;
									exponent_digit = false;
									decimal = false;
									val.string = str;
									input.n = n;
									collectNumber();
									break;
								}

								if( word === WORD_POS_AFTER_FIELD ) {
									status = false;
									throwError( "fault while parsing; character unexpected", cInt );
								}
								if( word === WORD_POS_RESET ) {
									word = WORD_POS_FIELD;
									val.value_type = VALUE_STRING;
									val.string += str;
									//_DEBUG_PARSING  && console.log( "START/CONTINUE IDENTIFER" );
									break;

								}     
								if( val.value_type == VALUE_UNSET ) {
									if( word !== WORD_POS_RESET && word !== WORD_POS_END )
										recoverIdent( cInt );
								} else {
									if( word === WORD_POS_END || word === WORD_POS_FIELD ) {
										// final word of the line... 
										// whispace changes the 'word' state to not 'end'
										// until the next character, which may restore it to
										// 'end' and this will resume collecting the same string.
										val.string += str;
										break;
									}
									if( parse_context == CONTEXT_OBJECT_FIELD ) {
										if( word == WORD_POS_FIELD ) {
											val.string+=str;
											break;
										}
										throwError( "Multiple values found in field name", cInt );
									}
									if( parse_context == CONTEXT_OBJECT_FIELD_VALUE ) {
										throwError( "String unexpected", cInt );
									}
								}
								break; // default
							}
							
						}else {
							if( word == WORD_POS_RESET && ( ( cInt >= 48/*'0'*/ && cInt <= 57/*'9'*/ ) || ( cInt == 43/*'+'*/ ) || ( cInt == 46/*'.'*/ ) || ( cInt == 45/*'-'*/ ) ) ) {
								fromHex = false;
								exponent = false;
								date_format = false;
								isBigInt = false;

								exponent_sign = false;
								exponent_digit = false;
								decimal = false;
								val.string = str;
								input.n = n;
								collectNumber();
							} else {
								//console.log( "TICK")
								if( val.value_type == VALUE_UNSET ) {
									if( word != WORD_POS_RESET ) {
										recoverIdent( cInt );
									} else {
										word = WORD_POS_END;
										val.string += str;
										val.value_type = VALUE_STRING;
									}
								} else {
									if( parse_context == CONTEXT_OBJECT_FIELD ) {
										throwError( "Multiple values found in field name", cInt );
									}
									else if( parse_context == CONTEXT_OBJECT_FIELD_VALUE ) {

										if( val.value_type != VALUE_STRING ) {
											if( val.value_type == VALUE_OBJECT || val.value_type == VALUE_ARRAY ){
												throwError( "String unexpected", cInt );
											}
											recoverIdent(cInt);
										}
										if( word == WORD_POS_AFTER_FIELD ){
											const  protoDef = getProto();
											if( protoDef){
												val.string = str;
											}
											else 
												throwError( "String unexpected", cInt );
										} else {
											if( word == WORD_POS_END ) {
												val.string += str;
											}else
												throwError( "String unexpected", cInt );
										}
									}
									else if( parse_context == CONTEXT_IN_ARRAY ) {
										if( word == WORD_POS_AFTER_FIELD ){
											if( !val.className ){
												//	getProto()
												val.className = val.string;
												val.string = '';
											}
											val.string += str;
											break;
										} else {
											if( word == WORD_POS_END )
												val.string += str;
										}

									}
								}
								
								//recoverIdent(cInt);
							}
							break; // default
						}
						break;
						case 96://'`':
						case 34://'"':
						case 39://'\'':
						{
							if( val.string ) val.className = val.string; val.string = '';
							let string_status = gatherString( cInt );
							//_DEBUG_PARSING && console.log( "string gather for object field value :", val.string, string_status, completed, input.n, buf.length );
							if( string_status ) {
								val.value_type = VALUE_STRING;
								word = WORD_POS_END;
							} else {
								gatheringStringFirstChar = cInt;
								gatheringString = true;
							}
							break;
						}
						case 10://'\n':
							pos.line++;
							pos.col = 1;
							//falls through
						case 32://' ':
						case 9://'\t':
						case 13://'\r':
						case 0x2028: // LS (Line separator)
						case 0x2029: // PS (paragraph separate)
						case 0xFEFF://'\uFEFF':
							//_DEBUG_WHITESPACE && console.log( "Whitespace...", word, parse_context );
							if( word == WORD_POS_END ) {
								if( parse_context == CONTEXT_UNKNOWN ) {
									word = WORD_POS_RESET;
									completed = true;
									break;
								} else if( parse_context == CONTEXT_OBJECT_FIELD_VALUE ) {
									word = WORD_POS_AFTER_FIELD_VALUE;
									break;
								} else if( parse_context == CONTEXT_OBJECT_FIELD ) {
									word = WORD_POS_AFTER_FIELD;
									break;
								} else if( parse_context == CONTEXT_IN_ARRAY ) {
									word = WORD_POS_AFTER_FIELD;
									break;
								}
							}
							if( word == WORD_POS_RESET || ( word == WORD_POS_AFTER_FIELD ))
								break;
							else if( word == WORD_POS_FIELD ) {
								if( val.string.length )
									word = WORD_POS_AFTER_FIELD;
							}
							else {
								if( word < WORD_POS_END ) 
									recoverIdent( cInt );
							}
							break;
					//----------------------------------------------------------
					//  catch characters for true/false/null/undefined which are values outside of quotes
						case 116://'t':
							if( word == WORD_POS_RESET ) word = WORD_POS_TRUE_1;
							else if( word == WORD_POS_INFINITY_6 ) word = WORD_POS_INFINITY_7;
							else { recoverIdent(cInt); }// fault
							break;
						case 114://'r':
							if( word == WORD_POS_TRUE_1 ) word = WORD_POS_TRUE_2;
							else { recoverIdent(cInt); }// fault
							break;
						case 117://'u':
							if( word == WORD_POS_TRUE_2 ) word = WORD_POS_TRUE_3;
							else if( word == WORD_POS_NULL_1 ) word = WORD_POS_NULL_2;
							else if( word == WORD_POS_RESET ) word = WORD_POS_UNDEFINED_1;
							else { recoverIdent(cInt); }// fault
							break;
						case 101://'e':
							if( word == WORD_POS_TRUE_3 ) {
								val.value_type = VALUE_TRUE;
								word = WORD_POS_END;
							} else if( word == WORD_POS_FALSE_4 ) {
								val.value_type = VALUE_FALSE;
								word = WORD_POS_END;
							} else if( word == WORD_POS_UNDEFINED_3 ) word = WORD_POS_UNDEFINED_4;
							else if( word == WORD_POS_UNDEFINED_7 ) word = WORD_POS_UNDEFINED_8;
							else { recoverIdent(cInt); }// fault
							break;
						case 110://'n':
							if( word == WORD_POS_RESET ) word = WORD_POS_NULL_1;
							else if( word == WORD_POS_UNDEFINED_1 ) word = WORD_POS_UNDEFINED_2;
							else if( word == WORD_POS_UNDEFINED_6 ) word = WORD_POS_UNDEFINED_7;
							else if( word == WORD_POS_INFINITY_1 ) word = WORD_POS_INFINITY_2;
							else if( word == WORD_POS_INFINITY_4 ) word = WORD_POS_INFINITY_5;
							else { recoverIdent(cInt); }// fault
							break;
						case 100://'d':
							if( word == WORD_POS_UNDEFINED_2 ) word = WORD_POS_UNDEFINED_3;
							else if( word == WORD_POS_UNDEFINED_8 ) { val.value_type=VALUE_UNDEFINED; word = WORD_POS_END; }
							else { recoverIdent(cInt); }// fault
							break;
						case 105://'i':
							if( word == WORD_POS_UNDEFINED_5 ) word = WORD_POS_UNDEFINED_6;
							else if( word == WORD_POS_INFINITY_3 ) word = WORD_POS_INFINITY_4;
							else if( word == WORD_POS_INFINITY_5 ) word = WORD_POS_INFINITY_6;
							else { recoverIdent(cInt); }// fault
							break;
						case 108://'l':
							if( word == WORD_POS_NULL_2 ) word = WORD_POS_NULL_3;
							else if( word == WORD_POS_NULL_3 ) {
								val.value_type = VALUE_NULL;
								word = WORD_POS_END;
							} else if( word == WORD_POS_FALSE_2 ) word = WORD_POS_FALSE_3;
							else { recoverIdent(cInt); }// fault
							break;
						case 102://'f':
							if( word == WORD_POS_RESET ) word = WORD_POS_FALSE_1;
							else if( word == WORD_POS_UNDEFINED_4 ) word = WORD_POS_UNDEFINED_5;
							else if( word == WORD_POS_INFINITY_2 ) word = WORD_POS_INFINITY_3;
							else { recoverIdent(cInt); }// fault
							break;
						case 97://'a':
							if( word == WORD_POS_FALSE_1 ) word = WORD_POS_FALSE_2;
							else if( word == WORD_POS_NAN_1 ) word = WORD_POS_NAN_2;
							else { recoverIdent(cInt); }// fault
							break;
						case 115://'s':
							if( word == WORD_POS_FALSE_3 ) word = WORD_POS_FALSE_4;
							else { recoverIdent(cInt); }// fault
							break;
						case 73://'I':
							if( word == WORD_POS_RESET ) word = WORD_POS_INFINITY_1;
							else { recoverIdent(cInt); }// fault
							break;
						case 78://'N':
							if( word == WORD_POS_RESET ) word = WORD_POS_NAN_1;
							else if( word == WORD_POS_NAN_2 ) { val.value_type = negative ? VALUE_NEG_NAN : VALUE_NAN; negative = false; word = WORD_POS_END; }
							else { recoverIdent(cInt); }// fault
							break;
						case 121://'y':
							if( word == WORD_POS_INFINITY_7 ) { val.value_type = negative ? VALUE_NEG_INFINITY : VALUE_INFINITY; negative = false; word = WORD_POS_END; }
							else { recoverIdent(cInt); }// fault
							break;
						case 45://'-':
							if( word == WORD_POS_RESET ) negative = !negative;
							else { recoverIdent(cInt); }// fault
							break;
						case 43://'+':
							if( word !== WORD_POS_RESET ) { recoverIdent(cInt); }
							break;
						}
						break; // default of high level switch
					//
					//----------------------------------------------------------
					}
					if( completed ) {
						if( word == WORD_POS_END ) {
							word = WORD_POS_RESET;
						}
						break;
					}
				}

				if( n == buf.length ) {
					dropBuffer( input );
					if( gatheringString || gatheringNumber || parse_context == CONTEXT_OBJECT_FIELD ) {
						retval = 0;
					}
					else {
						if( parse_context == CONTEXT_UNKNOWN && ( val.value_type != VALUE_UNSET || result ) ) {
							completed = true;
							retval = 1;
						}
					}
				}
				else {
					// put these back into the stack.
					input.n = n;
					inQueue.unshift( input );
					retval = 2;  // if returning buffers, then obviously there's more in this one.
				}
				if( completed ) {
					rootObject = null;
					break;
				}
			}

			if( !status ) return -1;
			if( completed && val.value_type != VALUE_UNSET ) {
				word = WORD_POS_RESET;
				result = convertValue();
				//_DEBUG_PARSING && console.log( "Result(3):", result );
				negative = false;
				val.string = '';
				val.value_type = VALUE_UNSET;
			}
			completed = false;
			return retval;
		}
	}
};



const _parser = [Object.freeze( JSOX.begin() )];
let _parse_level = 0;
JSOX.parse = function( msg, reviver ) {
	let parse_level = _parse_level++;
	let parser;
	if( _parser.length <= parse_level )
		_parser.push( Object.freeze( JSOX.begin() ) );
	parser = _parser[parse_level];
	if (typeof msg !== "string") msg = String(msg);
	parser.reset();
	const writeResult = parser._write( msg, true );
	if( writeResult > 0 ) {
		let result = parser.value();
		if( ( "undefined" === typeof result ) && writeResult > 1 ){
			throw new Error( "Pending value could not complete");
		}

		result = typeof reviver === 'function' ? (function walk(holder, key) {
			let k, v, value = holder[key];
			if (value && typeof value === 'object') {
				for (k in value) {
					if (Object.prototype.hasOwnProperty.call(value, k)) {
						v = walk(value, k);
						if (v !== undefined) {
							value[k] = v;
						} else {
							delete value[k];
						}
					}
				}
			}
			return reviver.call(holder, key, value);
		}({'': result}, '')) : result;
		_parse_level--;
		return result;
	}
	parser.finalError();
	return undefined;
};


function this_value() {/*//_DEBUG_STRINGIFY&&console.log( "this:", this, "valueof:", this&&this.valueOf() );*/ 
	return this&&this.valueOf();
}

JSOX.defineClass = function( name, obj ) {
	let cls;
	let denormKeys = Object.keys(obj);
	for( let i = 1; i < denormKeys.length; i++ ) {
		let a, b;
		if( ( a = denormKeys[i-1] ) > ( b = denormKeys[i] ) ) {
			denormKeys[i-1] = b;
			denormKeys[i] = a;
			if( i ) i-=2; // go back 2, this might need to go further pack.
			else i--; // only 1 to check.
		}
	}
	//console.log( "normalized:", denormKeys );
	commonClasses.push( cls = { name : name
		   , tag:denormKeys.toString()
		   , proto : Object.getPrototypeOf(obj)
		   , fields : Object.keys(obj) } );
	for(let n = 1; n < cls.fields.length; n++) {
		if( cls.fields[n] < cls.fields[n-1] ) {
			let tmp = cls.fields[n-1];
			cls.fields[n-1] = cls.fields[n];
			cls.fields[n] = tmp;
			if( n > 1 )
				n-=2;
		}
	}
	if( cls.proto === Object.getPrototypeOf( {} ) ) cls.proto = null;
};


JSOX.toJSOX =
JSOX.registerToJSOX = function( name, ptype, f ) {
	//console.log( "SET OBJECT TYPE:", ptype, ptype.prototype, Object.prototype, ptype.constructor );
	if( !ptype.prototype || ptype.prototype !== Object.prototype ) {
		if( toProtoTypes.get(ptype.prototype) ) throw new Error( "Existing toJSOX has been registered for prototype" );
		//_DEBUG_PARSING && console.log( "PUSH PROTOTYPE" );
		toProtoTypes.set( ptype.prototype, { external:true, name:name||f.constructor.name, cb:f } );
	} else {
		let key = Object.keys( ptype ).toString();
		if( toObjectTypes.get(key) ) throw new Error( "Existing toJSOX has been registered for object type" );
		//console.log( "TEST SET OBJECT TYPE:", key );
		toObjectTypes.set( key, { external:true, name:name, cb:f } );
	}
};

JSOX.fromJSOX = function( prototypeName, o, f ) {
	function privateProto() { }
		if( !o ) o = privateProto.prototype;
		if( fromProtoTypes.get(prototypeName) ) throw new Error( "Existing fromJSOX has been registered for prototype" );
		if( o && !("constructor" in o )){
			throw new Error( "Please pass a prototype like thing...");
	}
	fromProtoTypes.set( prototypeName, {protoCon: o.prototype.constructor, cb:f } );

};
JSOX.registerFromJSOX = function( prototypeName, o /*, f*/ ) {
	throw new Error( "deprecated; please adjust code to use fromJSOX:" + prototypeName + o.toString() );
	/*
	if( fromProtoTypes.get(prototypeName) ) throw new Error( "Existing fromJSOX has been registered for prototype" );
	if( "function" === typeof o ) {
		console.trace( "Please update usage of registration... proto and function")
		f = o
		o = Object.getPrototypeOf( {} );
	} 
	if( !f ) {
		console.trace( "(missing f) Please update usage of registration... proto and function")
	}
	fromProtoTypes.set( prototypeName, {protoCon:o, cb:f } );
	*/
};
JSOX.addType = function( prototypeName, prototype, to, from ) {
	JSOX.toJSOX( prototypeName, prototype, to );
	JSOX.fromJSOX( prototypeName, prototype, from );
};

JSOX.registerToFrom = function( prototypeName, prototype/*, to, from*/ ) {
	throw new Error( "registerToFrom deprecated; please use addType:" + prototypeName + prototype.toString() );
};

JSOX.stringifier = function() {
	let classes = [];
	let useQuote = '"';

	let fieldMap = new WeakMap();
	const path = [];
	let encoding = [];
	const localToProtoTypes = new WeakMap();
	const localToObjectTypes = new Map();
	let objectToJSOX = null;
	const stringifying = []; // things that have been stringified through external toJSOX; allows second pass to skip this toJSOX pass and encode 'normally'
	let ignoreNonEnumerable = false;
	function getIdentifier(s) {
	
		if( !isNaN( s ) ) {
			return ["'",s.toString(),"'"].join('');
		}
		// should check also for if any non ident in string...
		return ( ( s in keywords /* [ "true","false","null","NaN","Infinity","undefined"].find( keyword=>keyword===s )*/
			|| /([0-9-])/.test(s[0])
			|| /((\n|\r|\t)|[ {}()<>!+*/.:,-])/.test( s ) )?(useQuote + JSOX.escape(s) +useQuote):s )

	}


	/* init prototypes */
	if( !toProtoTypes.get( Object.prototype ) )
	{
		toProtoTypes.set( Object.prototype, { external:false, name:Object.prototype.constructor.name, cb:null } );
	   
	   
		// function https://stackoverflow.com/a/17415677/4619267
		toProtoTypes.set( Date.prototype, { external:false,
			name : "Date",
			cb : function () {
				let tzo = -this.getTimezoneOffset(),
					dif = tzo >= 0 ? '+' : '-',
					pad = function(num) {
						let norm = Math.floor(Math.abs(num));
						return (norm < 10 ? '0' : '') + norm;
					},
					pad3 = function(num) {
						let norm = Math.floor(Math.abs(num));
						return (norm < 100 ? '0' : '') + (norm < 10 ? '0' : '') + norm;
					};
				return [this.getFullYear() ,
					'-' , pad(this.getMonth() + 1) ,
					'-' , pad(this.getDate()) ,
					'T' , pad(this.getHours()) ,
					':' , pad(this.getMinutes()) ,
					':' , pad(this.getSeconds()) ,
					'.' + pad3(this.getMilliseconds()) +
					dif , pad(tzo / 60) ,
					':' , pad(tzo % 60)].join("");
			} 
		} );
		toProtoTypes.set( Boolean.prototype, { external:false, name:"Boolean", cb:this_value  } );
		toProtoTypes.set( Number.prototype, { external:false, name:"Number"
		    , cb:function(){ 
				if( isNaN(this) )  return "NaN";
				return (isFinite(this))
					? String(this)
					: (this<0)?"-Infinity":"Infinity";
		    }
		} );
		toProtoTypes.set( String.prototype, { external:false
		    , name : "String"
		    , cb:function(){ return '"' + JSOX.escape(this_value.apply(this)) + '"' } } );
		if( typeof BigInt === "function" )
			toProtoTypes.set( BigInt.prototype
			     , { external:false, name:"BigInt", cb:function() { return this + 'n' } } );
	   
		toProtoTypes.set( ArrayBuffer.prototype, { external:true, name:"ab"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer(this))+"]" }
		} );
	   
		toProtoTypes.set( Uint8Array.prototype, { external:true, name:"u8"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer(this.buffer))+"]" }
		} );
		toProtoTypes.set( Uint8ClampedArray.prototype, { external:true, name:"uc8"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer(this.buffer))+"]" }
		} );
		toProtoTypes.set( Int8Array.prototype, { external:true, name:"s8"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer(this.buffer))+"]" }
		} );
		toProtoTypes.set( Uint16Array.prototype, { external:true, name:"u16"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer(this.buffer))+"]" }
		} );
		toProtoTypes.set( Int16Array.prototype, { external:true, name:"s16"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer(this.buffer))+"]" }
		} );
		toProtoTypes.set( Uint32Array.prototype, { external:true, name:"u32"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer(this.buffer))+"]" }
		} );
		toProtoTypes.set( Int32Array.prototype, { external:true, name:"s32"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer(this.buffer))+"]" }
		} );
		/*
		if( typeof Uint64Array != "undefined" )
			toProtoTypes.set( Uint64Array.prototype, { external:true, name:"u64"
			    , cb:function() { return "["+getIdentifier(base64ArrayBuffer(this.buffer))+"]" }
			} );
		if( typeof Int64Array != "undefined" )
			toProtoTypes.set( Int64Array.prototype, { external:true, name:"s64"
			    , cb:function() { return "["+getIdentifier(base64ArrayBuffer(this.buffer))+"]" }
			} );
		*/
		toProtoTypes.set( Float32Array.prototype, { external:true, name:"f32"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer(this.buffer))+"]" }
		} );
		toProtoTypes.set( Float64Array.prototype, { external:true, name:"f64"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer(this.buffer))+"]" }
		} );
		toProtoTypes.set( Float64Array.prototype, { external:true, name:"f64"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer(this.buffer))+"]" }
		} );
	   
		toProtoTypes.set( RegExp.prototype, mapToJSOX = { external:true, name:"regex"
		    , cb:function(o,stringifier){
				return "'"+escape(this.source)+"'";
			}
		} );
		fromProtoTypes.set( "regex", { protoCon:RegExp, cb:function (field,val){
			return new RegExp( this );
		} } );

		toProtoTypes.set( Map.prototype, mapToJSOX = { external:true, name:"map"
		    , cb:null
		} );
		fromProtoTypes.set( "map", { protoCon:Map, cb:function (field,val){
			if( field ) {
				this.set( field, val );
				return undefined;
			}
			return this;
		} } );
	   
		toProtoTypes.set( Array.prototype, arrayToJSOX = { external:false, name:Array.prototype.constructor.name
		    , cb: null		    
		} );

	}

	const stringifier = {
		defineClass(name,obj) { 
			let cls; 
			let denormKeys = Object.keys(obj);
			for( let i = 1; i < denormKeys.length; i++ ) {
				// normalize class key order
				let a, b;
				if( ( a = denormKeys[i-1] ) > ( b = denormKeys[i] ) ) {
					denormKeys[i-1] = b;
					denormKeys[i] = a;
					if( i ) i-=2; // go back 2, this might need to go further pack.
					else i--; // only 1 to check.
				}
			}
			classes.push( cls = { name : name
			       , tag:denormKeys.toString()
			       , proto : Object.getPrototypeOf(obj)
			       , fields : Object.keys(obj) } );

			for(let n = 1; n < cls.fields.length; n++) {
				if( cls.fields[n] < cls.fields[n-1] ) {
					let tmp = cls.fields[n-1];
					cls.fields[n-1] = cls.fields[n];
					cls.fields[n] = tmp;
					if( n > 1 )
						n-=2;
				}
			}
			if( cls.proto === Object.getPrototypeOf( {} ) ) cls.proto = null;
		},
		setDefaultObjectToJSOX( cb ) { objectToJSOX = cb; },
		isEncoding(o) {
			//console.log( "is object encoding?", encoding.length, o, encoding );
			return !!encoding.find( (eo,i)=>eo===o && i < (encoding.length-1) )
		},
		encodeObject(o) {
			if( objectToJSOX ) 
				return objectToJSOX.apply(o, [this]);
			return o;
		},
		stringify(o,r,s) { return stringify(o,r,s) },
		setQuote(q) { useQuote = q; },
		registerToJSOX(n,p,f) { return this.toJSOX( n,p,f ) },
		toJSOX( name, ptype, f ) {
			if( ptype.prototype && ptype.prototype !== Object.prototype ) {
				if( localToProtoTypes.get(ptype.prototype) ) throw new Error( "Existing toJSOX has been registered for prototype" );
				localToProtoTypes.set( ptype.prototype, { external:true, name:name||f.constructor.name, cb:f } );
			} else {
				let key = Object.keys( ptype ).toString();
				if( localToObjectTypes.get(key) ) throw new Error( "Existing toJSOX has been registered for object type" );
				localToObjectTypes.set( key, { external:true, name:name, cb:f } );
			}
		},
		get ignoreNonEnumerable() { return ignoreNonEnumerable; },
		set ignoreNonEnumerable(val) { ignoreNonEnumerable = val; },
	};
	return stringifier;

	function getReference( here ) {
		if( here === null ) return undefined;
		let field = fieldMap.get( here );
		//_DEBUG_STRINGIFY && console.log( "path:", _JSON.stringify(path), field );
		if( !field ) {
			fieldMap.set( here, _JSON.stringify(path) );
			return undefined;
		}
		return field;
	}



	function matchObject(o,useK) {
		let k;
		let cls;
		let prt = Object.getPrototypeOf(o);
		cls = classes.find( cls=>{
			if( cls.proto && cls.proto === prt ) return true;
		} );
		if( cls ) return cls;

		if( classes.length || commonClasses.length ) {
			if( useK )  {
				useK = useK.map( v=>{ if( typeof v === "string" ) return v; else return undefined; } );
				k = useK.toString();
			} else {
				let denormKeys = Object.keys(o);
				for( let i = 1; i < denormKeys.length; i++ ) {
					let a, b;
					if( ( a = denormKeys[i-1] ) > ( b = denormKeys[i] ) ) {
						denormKeys[i-1] = b;
						denormKeys[i] = a;
						if( i ) i-=2; // go back 2, this might need to go further pack.
						else i--; // only 1 to check.
					}
				}
				k = denormKeys.toString();
			}
			cls = classes.find( cls=>{
				if( cls.tag === k ) return true;
			} );
			if( !cls )
				cls = commonClasses.find( cls=>{
					if( cls.tag === k ) return true;
				} );
		}
		return cls;
	}


	function stringify( object, replacer, space ) {
		if( object === undefined ) return "undefined";
		if( object === null ) return;
		let firstRun = true;
		let gap;
		let indent;
		let rep;

		let i;
		const spaceType = typeof space;
		const repType = typeof replacer;
		gap = "";
		indent = "";

		// If the space parameter is a number, make an indent string containing that
		// many spaces.

		if (spaceType === "number") {
			for (i = 0; i < space; i += 1) {
				indent += " ";
			}

		// If the space parameter is a string, it will be used as the indent string.
		} else if (spaceType === "string") {
			indent = space;
		}

		// If there is a replacer, it must be a function or an array.
		// Otherwise, throw an error.

		rep = replacer;
		if( replacer && repType !== "function"
		    && ( repType !== "object"
		       || typeof replacer.length !== "number"
		   )) {
			throw new Error("JSOX.stringify");
		}

		path.length = 0;
		fieldMap = new WeakMap();

		const finalResult = str( "", {"":object} );
		commonClasses.length = 0;
		return finalResult;

		// from https://github.com/douglascrockford/JSON-js/blob/master/json2.js#L181
		function str(key, holder) {
			function doArrayToJSOX() {
				let v;
				let partial = [];
				let thisNodeNameIndex = path.length;

				// The value is an array. Stringify every element. Use null as a placeholder
				// for non-JSOX values.
			
				for (let i = 0; i < this.length; i += 1) {
					path[thisNodeNameIndex] = i;
					partial[i] = str(i, this) || "null";
				}
				path.length = thisNodeNameIndex;
				//console.log( "remove encoding item", thisNodeNameIndex, encoding.length);
				encoding.length = thisNodeNameIndex;
			
				// Join all of the elements together, separated with commas, and wrap them in
				// brackets.
				v = ( partial.length === 0
					? "[]"
					: gap
						? [
							"[\n"
							, gap
							, partial.join(",\n" + gap)
							, "\n"
							, mind
							, "]"
						].join("")
						: "[" + partial.join(",") + "]" );
				return v;
			} 
			function mapToObject(){
				//_DEBUG_PARSING_DETAILS && console.log( "---------- NEW MAP -------------" );
				let tmp = {tmp:null};
				let out = '{';
				let first = true;
				//console.log( "CONVERT:", map);
				for (let [key, value] of this) {
					//console.log( "er...", key, value )
					tmp.tmp = value;
					let thisNodeNameIndex = path.length;
					path[thisNodeNameIndex] = key;
							
					out += (first?"":",") + getIdentifier(key) +':' + str("tmp", tmp);
					path.length = thisNodeNameIndex;
					first = false;
				}
				out += '}';
				//console.log( "out is:", out );
				return out;
			}
			if( firstRun ) {
				arrayToJSOX.cb = doArrayToJSOX;
				mapToJSOX.cb = mapToObject;
				firstRun = false;
			}

		// Produce a string from holder[key].

			let i;          // The loop counter.
			let k;          // The member key.
			let v;          // The member value.
			let length;
			let mind = gap;
			let partialClass;
			let partial;
			let thisNodeNameIndex = path.length;
			let value = holder[key];
			let isObject = (typeof value === "object");
			let c;

			if( isObject && ( value !== null ) ) {
				if( objectToJSOX ){
					if( !stringifying.find( val=>val===value ) ) {
						stringifying.push( value );
						encoding[thisNodeNameIndex] = value;
						value = objectToJSOX.apply(value, [stringifier]);
						//console.log( "Converted by object lookup -it's now a different type"
						//	, protoConverter, objectConverter );
						isObject = ( typeof value === "object" );
						stringifying.pop();
						encoding.length = thisNodeNameIndex;
						isObject = (typeof value === "object");
					}
					//console.log( "Value convereted to:", key, value );
				}
			}
			const objType = (value !== undefined && value !== null) && Object.getPrototypeOf( value );
			
			let protoConverter = objType
				&& ( localToProtoTypes.get( objType ) 
				|| toProtoTypes.get( objType ) 
				|| null );
			let objectConverter = !protoConverter && (value !== undefined && value !== null) 
				&& ( localToObjectTypes.get( Object.keys( value ).toString() ) 
				|| toObjectTypes.get( Object.keys( value ).toString() ) 
				|| null );

				//console.log( "PROTOTYPE:", Object.getPrototypeOf( value ) )
				//console.log( "PROTOTYPE:", toProtoTypes.get(Object.getPrototypeOf( value )) )
			//	if( protoConverter )
			//_DEBUG_STRINGIFY && console.log( "TEST()", value, protoConverter, objectConverter );

			let toJSOX = ( protoConverter && protoConverter.cb ) 
			          || ( objectConverter && objectConverter.cb );
			// If the value has a toJSOX method, call it to obtain a replacement value.
			//_DEBUG_STRINGIFY && console.log( "type:", typeof value, protoConverter, !!toJSOX, path );

			if( value !== undefined
			    && value !== null
			    && typeof toJSOX === "function"
			) {
				gap += indent;
				if( typeof value === "object" ) {
					v = getReference( value );
					//_DEBUG_STRINGIFY && console.log( "This object is not yet an tracked object path:", v, value  );
					if( v ) return "ref"+v;
				}

				let newValue = toJSOX.call(value,stringifier);
				//_DEBUG_STRINGIFY && console.log( "translated ", newValue, value );
				value = newValue;
				gap = mind;
			} else 
				if( typeof value === "object" ) {
					v = getReference( value );
					if( v ) return "ref"+v;
				}

			// If we were called with a replacer function, then call the replacer to
			// obtain a replacement value.

			if (typeof rep === "function") {
				value = rep.call(holder, key, value);
			}
			// What happens next depends on the value's type.
			switch (typeof value) {
			case "bigint":
				return value + 'n';
			case "string":
			case "number": 
				{
					let c = '';
					if( key==="" )
						c = classes.map( cls=> cls.name+"{"+cls.fields.join(",")+"}" ).join(gap?"\n":"")+
						    commonClasses.map( cls=> cls.name+"{"+cls.fields.join(",")+"}" ).join(gap?"\n":"")
								+(gap?"\n":"");
					if( protoConverter && protoConverter.external ) 
						return c + protoConverter.name + value;
					if( objectConverter && objectConverter.external ) 
						return c + objectConverter.name + value;
					return c + value;//useQuote+JSOX.escape( value )+useQuote;
				}
			case "boolean":
			case "null":

				// If the value is a boolean or null, convert it to a string. Note:
				// typeof null does not produce "null". The case is included here in
				// the remote chance that this gets fixed someday.

				return String(value);

				// If the type is "object", we might be dealing with an object or an array or
				// null.

			case "object":
				//_DEBUG_STRINGIFY && console.log( "ENTERINT OBJECT EMISSION WITH:", v );
				if( v ) return "ref"+v;

				// Due to a specification blunder in ECMAScript, typeof null is "object",
				// so watch out for that case.
				if (!value) {
					return "null";
				}

				// Make an array to hold the partial results of stringifying this object value.
				gap += indent;
				partialClass = null;
				partial = [];

				// If the replacer is an array, use it to select the members to be stringified.
				if (rep && typeof rep === "object") {
					length = rep.length;
					partialClass = matchObject( value, rep );
					for (i = 0; i < length; i += 1) {
						if (typeof rep[i] === "string") {
							k = rep[i];
							path[thisNodeNameIndex] = k;
							v = str(k, value);

							if (v) {
								if( partialClass ) {
									partial.push(v);
							} else
									partial.push( getIdentifier(k) 
									+ (
										(gap)
											? ": "
											: ":"
									) + v);
							}
						}
					}
					path.splice( thisNodeNameIndex, 1 );
				} else {

					// Otherwise, iterate through all of the keys in the object.
					partialClass = matchObject( value );
					let keys = [];
					for (k in value) {
						if( ignoreNonEnumerable )
							if( !Object.prototype.propertyIsEnumerable.call( value, k ) ){
								//_DEBUG_STRINGIFY && console.log( "skipping non-enuerable?", k );
								continue;
							}
						if (Object.prototype.hasOwnProperty.call(value, k)) {
							let n;
							for( n = 0; n < keys.length; n++ ) 
								if( keys[n] > k ) {	
									keys.splice(n,0,k );
									break;
								}
							if( n == keys.length )
								keys.push(k);
						}
					}
					for(let n = 0; n < keys.length; n++) {
						k = keys[n];
						if (Object.prototype.hasOwnProperty.call(value, k)) {
							path[thisNodeNameIndex] = k;
							v = str(k, value);

							if (v) {
								if( partialClass ) {
									partial.push(v);
							} else
									partial.push(getIdentifier(k) + (
										(gap)
											? ": "
											: ":"
									) + v);
							}
						}
					}
					path.splice( thisNodeNameIndex, 1 );
				}

				// Join all of the member texts together, separated with commas,
				// and wrap them in braces.
				//_DEBUG_STRINGIFY && console.log( "partial:", partial )

				//let c;
				if( key==="" )
					c = ( classes.map( cls=> cls.name+"{"+cls.fields.join(",")+"}" ).join(gap?"\n":"")
						|| commonClasses.map( cls=> cls.name+"{"+cls.fields.join(",")+"}" ).join(gap?"\n":""))+(gap?"\n":"");
				else
					c = '';

				if( protoConverter && protoConverter.external ) 
					c = c + getIdentifier(protoConverter.name);

				//_DEBUG_STRINGIFY && console.log( "PREFIX FOR THIS FIELD:", c );
				let ident = null;
				if( partialClass )
					ident = getIdentifier( partialClass.name ) ;
				v = c +
					( partial.length === 0
					? "{}"
					: gap
							? (partialClass?ident:"")+"{\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "}"
							: (partialClass?ident:"")+"{" + partial.join(",") + "}"
					);

				gap = mind;
				return v;
			}
		}

	}

	
	
};

	// Converts an ArrayBuffer directly to base64, without any intermediate 'convert to string then
	// use window.btoa' step. According to my tests, this appears to be a faster approach:
	// http://jsperf.com/encoding-xhr-image-data/5
	// doesn't have to be reversable....
	const encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$_';
	const decodings = { '~':-1
		,'=':-1
		,'$':62
		,'_':63
		,'+':62
		,'-':62
		,'.':62
		,'/':63
		,',':63
	};
	
	for( let x = 0; x < 256; x++ ) {
		if( x < 64 ) {
			decodings[encodings[x]] = x;
		}
	}
	Object.freeze( decodings );
	
	function base64ArrayBuffer(arrayBuffer) {
		let base64    = '';
	
		let bytes         = new Uint8Array(arrayBuffer);
		let byteLength    = bytes.byteLength;
		let byteRemainder = byteLength % 3;
		let mainLength    = byteLength - byteRemainder;
	
		let a, b, c, d;
		let chunk;
		//throw "who's using this?"
		//console.log( "buffer..", arrayBuffer )
		// Main loop deals with bytes in chunks of 3
		for (let i = 0; i < mainLength; i = i + 3) {
			// Combine the three bytes into a single integer
			chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

			// Use bitmasks to extract 6-bit segments from the triplet
			a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
			b = (chunk & 258048)   >> 12; // 258048   = (2^6 - 1) << 12
			c = (chunk & 4032)     >>  6; // 4032     = (2^6 - 1) << 6
			d = chunk & 63;               // 63       = 2^6 - 1
	
			// Convert the raw binary segments to the appropriate ASCII encoding
			base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
		}
	
	// Deal with the remaining bytes and padding
		if (byteRemainder == 1) {
			chunk = bytes[mainLength];
			a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2
			// Set the 4 least significant bits to zero
			b = (chunk & 3)   << 4; // 3   = 2^2 - 1
			base64 += encodings[a] + encodings[b] + '==';
		} else if (byteRemainder == 2) {
			chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];
			a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
			b = (chunk & 1008)  >>  4; // 1008  = (2^6 - 1) << 4
			// Set the 2 least significant bits to zero
			c = (chunk & 15)    <<  2; // 15    = 2^4 - 1
			base64 += encodings[a] + encodings[b] + encodings[c] + '=';
		}
		//console.log( "dup?", base64)
		return base64
	}
	
	
	function DecodeBase64( buf ) {	
		let outsize;
		if( buf.length % 4 == 1 )
			outsize = ((((buf.length + 3) / 4)|0) * 3) - 3;
		else if( buf.length % 4 == 2 )
			outsize = ((((buf.length + 3) / 4)|0) * 3) - 2;
		else if( buf.length % 4 == 3 )
			outsize = ((((buf.length + 3) / 4)|0) * 3) - 1;
		else if( decodings[buf[buf.length - 3]] == -1 )
			outsize = ((((buf.length + 3) / 4)|0) * 3) - 3;
		else if( decodings[buf[buf.length - 2]] == -1 ) 
			outsize = ((((buf.length + 3) / 4)|0) * 3) - 2;
		else if( decodings[buf[buf.length - 1]] == -1 ) 
			outsize = ((((buf.length + 3) / 4)|0) * 3) - 1;
		else
			outsize = ((((buf.length + 3) / 4)|0) * 3);
		let ab = new ArrayBuffer( outsize );
		let out = new Uint8Array(ab);

		let n;
		let l = (buf.length+3)>>2;
		for( n = 0; n < l; n++ ) {
			let index0 = decodings[buf[n*4]];
			let index1 = (n*4+1)<buf.length?decodings[buf[n*4+1]]:-1;
			let index2 = (index1>=0) && (n*4+2)<buf.length?decodings[buf[n*4+2]]:-1 ;
			let index3 = (index2>=0) && (n*4+3)<buf.length?decodings[buf[n*4+3]]:-1 ;
			if( index1 >= 0 )
				out[n*3+0] = (( index0 ) << 2 | ( index1 ) >> 4);
			if( index2 >= 0 )
				out[n*3+1] = (( index1 ) << 4 | ( ( ( index2 ) >> 2 ) & 0x0f ));
			if( index3 >= 0 )
				out[n*3+2] = (( index2 ) << 6 | ( ( index3 ) & 0x3F ));
		}

		return ab;
	}
	
	
JSOX.stringify = function( object, replacer, space ) {
	let stringifier = JSOX.stringifier();
	return stringifier.stringify( object, replacer, space );
};

const nonIdent = 
[ [ 0,256,[ 0xffd9ff,0xff6aff,0x1fc00,0x380000,0x0,0xfffff8,0xffffff,0x7fffff] ]
].map( row=>{ return { firstChar : row[0], lastChar: row[1], bits : row[2] }; } );

// usage
//  var RNG = require( "salty_random_generator")( callback }
//    constructor callback is used as a source of salt to the generator
//    the callback is passed an array to which strings are expected to be added
//     ( [] )=>{ [].push( more_salt ); }
//
//    - methods on RNG
//         reset()
//                clear current random state, and restart
//
//         getBits( /* 0-31 */ )
//                return a Number that is that many bits from the random stream
//
//         getBuffer( /* 0-n */ )
//                returns a ArrayBuffer that is that many bits of randomness...
//
//         save()
//                return an object representing the current RNG state
//
//         restore( o )
//                use object to restore RNG state.
//
//          feed( buf )
//                feed a raw uint8array.
//


//var exports = exports || {};

	// My JS Encoding $_ and = at the end.  allows most to be identifiers too.
	// 'standard' encoding + /
	// variants            - /
	//                     + ,
	//                     . _
	// variants            - _


const encodings$1 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$_';
const decodings$1 = { '~':0
		,'=':0
		,'$':62
		,'_':63
		,'+':62
		,'-':62
		,'.':62
		,'/':63
		,',':63
};
const u8xor_code_encodings2 = new Uint8Array( 64* 128 );

for( var x = 0; x < 256; x++ ) {
	if( x < 64 ) {
		decodings$1[encodings$1[x]] = x;
	}
}

//const u8xor_code_encodings2 = new Uint8Array( 64* 128 );

for( let a = 0; a < 64; a++  ) {
   for( let b = 0; b < encodings$1.length; b++  ) {
     u8xor_code_encodings2[(a<<7)+encodings$1.codePointAt(b)] = a^b;
   }
}

Object.freeze( decodings$1 );
//Object.freeze( u8xor_code_encodings2 );

const k12Module = {};
var k12 = (function(module){
var Module=typeof Module!=="undefined"?Module:{};

Module["arguments"]=[];Module["thisProgram"]="./this.program";Module["quit"]=(function(status,toThrow){throw toThrow});Module["preRun"]=[];Module["postRun"]=[];var ENVIRONMENT_IS_WEB=false;var ENVIRONMENT_IS_WORKER=false;var ENVIRONMENT_IS_NODE=false;var ENVIRONMENT_IS_SHELL=false;if(Module["ENVIRONMENT"]){if(Module["ENVIRONMENT"]==="WEB"){ENVIRONMENT_IS_WEB=true;}else if(Module["ENVIRONMENT"]==="WORKER"){ENVIRONMENT_IS_WORKER=true;}else if(Module["ENVIRONMENT"]==="NODE"){ENVIRONMENT_IS_NODE=true;}else if(Module["ENVIRONMENT"]==="SHELL"){ENVIRONMENT_IS_SHELL=true;}else {throw new Error("Module['ENVIRONMENT'] value is not valid. must be one of: WEB|WORKER|NODE|SHELL.")}}else {ENVIRONMENT_IS_WEB=typeof window==="object";ENVIRONMENT_IS_NODE=typeof process==="object"&&typeof require==="function"&&!ENVIRONMENT_IS_WEB&&!ENVIRONMENT_IS_WORKER;ENVIRONMENT_IS_SHELL=!ENVIRONMENT_IS_WEB&&!ENVIRONMENT_IS_NODE&&!ENVIRONMENT_IS_WORKER;}
	if(ENVIRONMENT_IS_NODE){var nodeFS;var nodePath;Module["read"]=function shell_read(filename,binary){var ret;ret=tryParseAsDataURI(filename);if(!ret){if(!nodeFS)nodeFS=require("fs");if(!nodePath)nodePath=require("path");filename=nodePath["normalize"](filename);ret=nodeFS["readFileSync"](filename);}return binary?ret:ret.toString()};
		Module["readBinary"]=function readBinary(filename){var ret=Module["read"](filename,true);if(!ret.buffer){ret=new Uint8Array(ret);}assert(ret.buffer);return ret};
		if(process["argv"].length>1){Module["thisProgram"]=process["argv"][1].replace(/\\/g,"/");}Module["arguments"]=process["argv"].slice(2);
		if(typeof module!=="undefined"){module["exports"]=Module;}
		Module["inspect"]=(function(){return "[Emscripten Module object]"});
        }
	else if(ENVIRONMENT_IS_SHELL){if(typeof read!="undefined"){Module["read"]=function shell_read(f){var data=tryParseAsDataURI(f);if(data){return intArrayToString(data)}return read(f)};}Module["readBinary"]=function readBinary(f){var data;data=tryParseAsDataURI(f);if(data){return data}if(typeof readbuffer==="function"){return new Uint8Array(readbuffer(f))}data=read(f,"binary");assert(typeof data==="object");return data};if(typeof scriptArgs!="undefined"){Module["arguments"]=scriptArgs;}else if(typeof arguments!="undefined"){Module["arguments"]=arguments;}if(typeof quit==="function"){Module["quit"]=(function(status,toThrow){quit(status);});}}else 
	if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){

        module["exports"]=Module;Module["read"]=function shell_read(url){try{var xhr=new XMLHttpRequest;xhr.open("GET",url,false);
	xhr.send(null);return xhr.responseText}catch(err){
	var data=tryParseAsDataURI(url);if(data){return intArrayToString(data)}throw err}};
	if(ENVIRONMENT_IS_WORKER){Module["readBinary"]=function readBinary(url){try{var xhr=new XMLHttpRequest;xhr.open("GET",url,false);xhr.responseType="arraybuffer";xhr.send(null);return new Uint8Array(xhr.response)}catch(err){var data=tryParseAsDataURI(url);if(data){return data}throw err}};}Module["readAsync"]=function readAsync(url,onload,onerror){var xhr=new XMLHttpRequest;xhr.open("GET",url,true);xhr.responseType="arraybuffer";xhr.onload=function xhr_onload(){if(xhr.status==200||xhr.status==0&&xhr.response){onload(xhr.response);return}var data=tryParseAsDataURI(url);if(data){onload(data.buffer);return}onerror();};xhr.onerror=onerror;xhr.send(null);};Module["setWindowTitle"]=(function(title){document.title=title;});}Module["print"]=typeof console!=="undefined"?console.log.bind(console):typeof print!=="undefined"?print:null;Module["printErr"]=typeof printErr!=="undefined"?printErr:typeof console!=="undefined"&&console.warn.bind(console)||Module["print"];Module.print=Module["print"];Module.printErr=Module["printErr"];

var STACK_ALIGN=16;function staticAlloc(size){assert(!staticSealed);var ret=STATICTOP;STATICTOP=STATICTOP+size+15&-16;return ret}function dynamicAlloc(size){assert(DYNAMICTOP_PTR);var ret=HEAP32[DYNAMICTOP_PTR>>2];var end=ret+size+15&-16;HEAP32[DYNAMICTOP_PTR>>2]=end;if(end>=TOTAL_MEMORY){var success=enlargeMemory();if(!success){HEAP32[DYNAMICTOP_PTR>>2]=ret;return 0}}return ret}function alignMemory(size,factor){if(!factor)factor=STACK_ALIGN;var ret=size=Math.ceil(size/factor)*factor;return ret}function getNativeTypeSize(type){switch(type){case"i1":case"i8":return 1;case"i16":return 2;case"i32":return 4;case"i64":return 8;case"float":return 4;case"double":return 8;default:{if(type[type.length-1]==="*"){return 4}else if(type[0]==="i"){var bits=parseInt(type.substr(1));assert(bits%8===0);return bits/8}else {return 0}}}}var functionPointers=new Array(0);var GLOBAL_BASE=8;var ABORT=0;function assert(condition,text){if(!condition){abort("Assertion failed: "+text);}}function setValue(ptr,value,type,noSafe){type=type||"i8";if(type.charAt(type.length-1)==="*")type="i32";switch(type){case"i1":HEAP8[ptr>>0]=value;break;case"i8":HEAP8[ptr>>0]=value;break;case"i16":HEAP16[ptr>>1]=value;break;case"i32":HEAP32[ptr>>2]=value;break;case"i64":tempI64=[value>>>0,(tempDouble=value,+Math_abs(tempDouble)>=+1?tempDouble>+0?(Math_min(+Math_floor(tempDouble/+4294967296),+4294967295)|0)>>>0:~~+Math_ceil((tempDouble- +(~~tempDouble>>>0))/+4294967296)>>>0:0)],HEAP32[ptr>>2]=tempI64[0],HEAP32[ptr+4>>2]=tempI64[1];break;case"float":HEAPF32[ptr>>2]=value;break;case"double":HEAPF64[ptr>>3]=value;break;default:abort("invalid type for setValue: "+type);}}var ALLOC_STATIC=2;var ALLOC_NONE=4;function allocate(slab,types,allocator,ptr){var zeroinit,size;if(typeof slab==="number"){zeroinit=true;size=slab;}else {zeroinit=false;size=slab.length;}var singleType=typeof types==="string"?types:null;var ret;if(allocator==ALLOC_NONE){ret=ptr;}else {ret=[typeof _malloc==="function"?_malloc:staticAlloc,stackAlloc,staticAlloc,dynamicAlloc][allocator===undefined?ALLOC_STATIC:allocator](Math.max(size,singleType?1:types.length));}if(zeroinit){var stop;ptr=ret;assert((ret&3)==0);stop=ret+(size&~3);for(;ptr<stop;ptr+=4){HEAP32[ptr>>2]=0;}stop=ret+size;while(ptr<stop){HEAP8[ptr++>>0]=0;}return ret}if(singleType==="i8"){if(slab.subarray||slab.slice){HEAPU8.set(slab,ret);}else {HEAPU8.set(new Uint8Array(slab),ret);}return ret}var i=0,type,typeSize,previousType;while(i<size){var curr=slab[i];type=singleType||types[i];if(type===0){i++;continue}if(type=="i64")type="i32";setValue(ret+i,curr,type);if(previousType!==type){typeSize=getNativeTypeSize(type);previousType=type;}i+=typeSize;}return ret}
function Pointer_stringify(ptr,length){if(length===0||!ptr)return "";var hasUtf=0;var t;var i=0;while(1){t=HEAPU8[ptr+i>>0];hasUtf|=t;if(t==0&&!length)break;i++;if(length&&i==length)break}if(!length)length=i;var ret="";if(hasUtf<128){var MAX_CHUNK=1024;var curr;while(length>0){curr=String.fromCharCode.apply(String,HEAPU8.subarray(ptr,ptr+Math.min(length,MAX_CHUNK)));ret=ret?ret+curr:curr;ptr+=MAX_CHUNK;length-=MAX_CHUNK;}return ret}return UTF8ToString(ptr)}var UTF8Decoder=typeof TextDecoder!=="undefined"?new TextDecoder("utf8"):undefined;
function UTF8ArrayToString(u8Array,idx){var endPtr=idx;while(u8Array[endPtr])++endPtr;if(endPtr-idx>16&&u8Array.subarray&&UTF8Decoder){return UTF8Decoder.decode(u8Array.subarray(idx,endPtr))}else {var u0,u1,u2,u3,u4,u5;var str="";while(1){u0=u8Array[idx++];if(!u0)return str;if(!(u0&128)){str+=String.fromCharCode(u0);continue}u1=u8Array[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}u2=u8Array[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2;}else {u3=u8Array[idx++]&63;if((u0&248)==240){u0=(u0&7)<<18|u1<<12|u2<<6|u3;}else {u4=u8Array[idx++]&63;if((u0&252)==248){u0=(u0&3)<<24|u1<<18|u2<<12|u3<<6|u4;}else {u5=u8Array[idx++]&63;u0=(u0&1)<<30|u1<<24|u2<<18|u3<<12|u4<<6|u5;}}}if(u0<65536){str+=String.fromCharCode(u0);}else {var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023);}}}}
function UTF8ToString(ptr){return UTF8ArrayToString(HEAPU8,ptr)}
function stringToUTF8Array(str,outU8Array,outIdx,maxBytesToWrite){if(!(maxBytesToWrite>0))return 0;var startIdx=outIdx;var endIdx=outIdx+maxBytesToWrite-1;for(var i=0;i<str.length;++i){var u=str.charCodeAt(i);if(u>=55296&&u<=57343)u=65536+((u&1023)<<10)|str.charCodeAt(++i)&1023;if(u<=127){if(outIdx>=endIdx)break;outU8Array[outIdx++]=u;}else if(u<=2047){if(outIdx+1>=endIdx)break;outU8Array[outIdx++]=192|u>>6;outU8Array[outIdx++]=128|u&63;}else if(u<=65535){if(outIdx+2>=endIdx)break;outU8Array[outIdx++]=224|u>>12;outU8Array[outIdx++]=128|u>>6&63;outU8Array[outIdx++]=128|u&63;}else if(u<=2097151){if(outIdx+3>=endIdx)break;outU8Array[outIdx++]=240|u>>18;outU8Array[outIdx++]=128|u>>12&63;outU8Array[outIdx++]=128|u>>6&63;outU8Array[outIdx++]=128|u&63;}else if(u<=67108863){if(outIdx+4>=endIdx)break;outU8Array[outIdx++]=248|u>>24;outU8Array[outIdx++]=128|u>>18&63;outU8Array[outIdx++]=128|u>>12&63;outU8Array[outIdx++]=128|u>>6&63;outU8Array[outIdx++]=128|u&63;}else {if(outIdx+5>=endIdx)break;outU8Array[outIdx++]=252|u>>30;outU8Array[outIdx++]=128|u>>24&63;outU8Array[outIdx++]=128|u>>18&63;outU8Array[outIdx++]=128|u>>12&63;outU8Array[outIdx++]=128|u>>6&63;outU8Array[outIdx++]=128|u&63;}}outU8Array[outIdx]=0;return outIdx-startIdx}
function stringToUTF8(str,outPtr,maxBytesToWrite){return stringToUTF8Array(str,HEAPU8,outPtr,maxBytesToWrite)}
function lengthBytesUTF8(str){var len=0;for(var i=0;i<str.length;++i){var u=str.charCodeAt(i);if(u>=55296&&u<=57343)u=65536+((u&1023)<<10)|str.charCodeAt(++i)&1023;if(u<=127){++len;}else if(u<=2047){len+=2;}else if(u<=65535){len+=3;}else if(u<=2097151){len+=4;}else if(u<=67108863){len+=5;}else {len+=6;}}return len}var UTF16Decoder=typeof TextDecoder!=="undefined"?new TextDecoder("utf-16le"):undefined;
var buffer,HEAP8,HEAPU8,HEAP16,HEAPU16,HEAP32,HEAPU32,HEAPF32,HEAPF64;function updateGlobalBufferViews(){Module["HEAP8"]=HEAP8=new Int8Array(buffer);Module["HEAP16"]=HEAP16=new Int16Array(buffer);Module["HEAP32"]=HEAP32=new Int32Array(buffer);Module["HEAPU8"]=HEAPU8=new Uint8Array(buffer);Module["HEAPU16"]=HEAPU16=new Uint16Array(buffer);Module["HEAPU32"]=HEAPU32=new Uint32Array(buffer);Module["HEAPF32"]=HEAPF32=new Float32Array(buffer);Module["HEAPF64"]=HEAPF64=new Float64Array(buffer);}var STATIC_BASE,STATICTOP,staticSealed;var STACK_BASE,STACKTOP,STACK_MAX;var DYNAMIC_BASE,DYNAMICTOP_PTR;STATIC_BASE=STATICTOP=STACK_BASE=STACKTOP=STACK_MAX=DYNAMIC_BASE=DYNAMICTOP_PTR=0;staticSealed=false;function abortOnCannotGrowMemory(){abort("Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value "+TOTAL_MEMORY+", (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or (4) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ");}function enlargeMemory(){abortOnCannotGrowMemory();}var TOTAL_STACK=Module["TOTAL_STACK"]||5242880;var TOTAL_MEMORY=Module["TOTAL_MEMORY"]||16777216;if(TOTAL_MEMORY<TOTAL_STACK)Module.printErr("TOTAL_MEMORY should be larger than TOTAL_STACK, was "+TOTAL_MEMORY+"! (TOTAL_STACK="+TOTAL_STACK+")");if(Module["buffer"]){buffer=Module["buffer"];}else {{buffer=new ArrayBuffer(TOTAL_MEMORY);}Module["buffer"]=buffer;}updateGlobalBufferViews();function getTotalMemory(){return TOTAL_MEMORY}HEAP32[0]=1668509029;HEAP16[1]=25459;if(HEAPU8[2]!==115||HEAPU8[3]!==99)throw "Runtime error: expected the system to be little-endian!";function callRuntimeCallbacks(callbacks){while(callbacks.length>0){var callback=callbacks.shift();if(typeof callback=="function"){callback();continue}var func=callback.func;if(typeof func==="number"){if(callback.arg===undefined){Module["dynCall_v"](func);}else {Module["dynCall_vi"](func,callback.arg);}}else {func(callback.arg===undefined?null:callback.arg);}}}var __ATPRERUN__=[];var __ATINIT__=[];var __ATMAIN__=[];var __ATEXIT__=[];var __ATPOSTRUN__=[];var runtimeInitialized=false;function preRun(){if(Module["preRun"]){if(typeof Module["preRun"]=="function")Module["preRun"]=[Module["preRun"]];while(Module["preRun"].length){addOnPreRun(Module["preRun"].shift());}}callRuntimeCallbacks(__ATPRERUN__);}function ensureInitRuntime(){if(runtimeInitialized)return;runtimeInitialized=true;callRuntimeCallbacks(__ATINIT__);}function preMain(){callRuntimeCallbacks(__ATMAIN__);}function exitRuntime(){callRuntimeCallbacks(__ATEXIT__);}function postRun(){if(Module["postRun"]){if(typeof Module["postRun"]=="function")Module["postRun"]=[Module["postRun"]];while(Module["postRun"].length){addOnPostRun(Module["postRun"].shift());}}callRuntimeCallbacks(__ATPOSTRUN__);}function addOnPreRun(cb){__ATPRERUN__.unshift(cb);}function addOnPostRun(cb){__ATPOSTRUN__.unshift(cb);}var Math_abs=Math.abs;var Math_ceil=Math.ceil;var Math_floor=Math.floor;var Math_min=Math.min;var runDependencies=0;var dependenciesFulfilled=null;function addRunDependency(id){runDependencies++;if(Module["monitorRunDependencies"]){Module["monitorRunDependencies"](runDependencies);}}function removeRunDependency(id){runDependencies--;if(Module["monitorRunDependencies"]){Module["monitorRunDependencies"](runDependencies);}if(runDependencies==0){if(dependenciesFulfilled){var callback=dependenciesFulfilled;dependenciesFulfilled=null;callback();}}}Module["preloadedImages"]={};Module["preloadedAudios"]={};
var memoryInitializer=null;


STATIC_BASE=GLOBAL_BASE;
STATICTOP=STATIC_BASE+4608;
__ATINIT__.push();
memoryInitializer="data:application/octet-stream;base64,AQAAAAAAAAAAAAAAiQAAAAAAAACLAACAAAAAAICAAIABAAAAiwAAAAEAAAAAgAAAAQAAAIiAAIABAAAAggAAgAAAAAALAAAAAAAAAAoAAAABAAAAgoAAAAAAAAADgAAAAQAAAIuAAAABAAAACwAAgAEAAACKAACAAQAAAIEAAIAAAAAAgQAAgAAAAAAIAACAAAAAAIMAAAAAAAAAA4AAgAEAAACIgACAAAAAAIgAAIABAAAAAIAAAAAAAACCgACA/wAAANAAAAAFAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAgAAAAAOAAAABAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAK/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADcDQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFBIQVNFOiVkABEACgAREREAAAAABQAAAAAAAAkAAAAACwAAAAAAAAAAEQAPChEREQMKBwABEwkLCwAACQYLAAALAAYRAAAAERERAAAAAAAAAAAAAAAAAAAAAAsAAAAAAAAAABEACgoREREACgAAAgAJCwAAAAkACwAACwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAMAAAAAAwAAAAACQwAAAAAAAwAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAADQAAAAQNAAAAAAkOAAAAAAAOAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAA8AAAAADwAAAAAJEAAAAAAAEAAAEAAAEgAAABISEgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASAAAAEhISAAAAAAAACQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACwAAAAAAAAAAAAAACgAAAAAKAAAAAAkLAAAAAAALAAALAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAwAAAAADAAAAAAJDAAAAAAADAAADAAALSsgICAwWDB4AChudWxsKQAtMFgrMFggMFgtMHgrMHggMHgAaW5mAElORgBuYW4ATkFOADAxMjM0NTY3ODlBQkNERUYuAFQhIhkNAQIDEUscDBAECx0SHidobm9wcWIgBQYPExQVGggWBygkFxgJCg4bHyUjg4J9JiorPD0+P0NHSk1YWVpbXF1eX2BhY2RlZmdpamtscnN0eXp7fABJbGxlZ2FsIGJ5dGUgc2VxdWVuY2UARG9tYWluIGVycm9yAFJlc3VsdCBub3QgcmVwcmVzZW50YWJsZQBOb3QgYSB0dHkAUGVybWlzc2lvbiBkZW5pZWQAT3BlcmF0aW9uIG5vdCBwZXJtaXR0ZWQATm8gc3VjaCBmaWxlIG9yIGRpcmVjdG9yeQBObyBzdWNoIHByb2Nlc3MARmlsZSBleGlzdHMAVmFsdWUgdG9vIGxhcmdlIGZvciBkYXRhIHR5cGUATm8gc3BhY2UgbGVmdCBvbiBkZXZpY2UAT3V0IG9mIG1lbW9yeQBSZXNvdXJjZSBidXN5AEludGVycnVwdGVkIHN5c3RlbSBjYWxsAFJlc291cmNlIHRlbXBvcmFyaWx5IHVuYXZhaWxhYmxlAEludmFsaWQgc2VlawBDcm9zcy1kZXZpY2UgbGluawBSZWFkLW9ubHkgZmlsZSBzeXN0ZW0ARGlyZWN0b3J5IG5vdCBlbXB0eQBDb25uZWN0aW9uIHJlc2V0IGJ5IHBlZXIAT3BlcmF0aW9uIHRpbWVkIG91dABDb25uZWN0aW9uIHJlZnVzZWQASG9zdCBpcyBkb3duAEhvc3QgaXMgdW5yZWFjaGFibGUAQWRkcmVzcyBpbiB1c2UAQnJva2VuIHBpcGUASS9PIGVycm9yAE5vIHN1Y2ggZGV2aWNlIG9yIGFkZHJlc3MAQmxvY2sgZGV2aWNlIHJlcXVpcmVkAE5vIHN1Y2ggZGV2aWNlAE5vdCBhIGRpcmVjdG9yeQBJcyBhIGRpcmVjdG9yeQBUZXh0IGZpbGUgYnVzeQBFeGVjIGZvcm1hdCBlcnJvcgBJbnZhbGlkIGFyZ3VtZW50AEFyZ3VtZW50IGxpc3QgdG9vIGxvbmcAU3ltYm9saWMgbGluayBsb29wAEZpbGVuYW1lIHRvbyBsb25nAFRvbyBtYW55IG9wZW4gZmlsZXMgaW4gc3lzdGVtAE5vIGZpbGUgZGVzY3JpcHRvcnMgYXZhaWxhYmxlAEJhZCBmaWxlIGRlc2NyaXB0b3IATm8gY2hpbGQgcHJvY2VzcwBCYWQgYWRkcmVzcwBGaWxlIHRvbyBsYXJnZQBUb28gbWFueSBsaW5rcwBObyBsb2NrcyBhdmFpbGFibGUAUmVzb3VyY2UgZGVhZGxvY2sgd291bGQgb2NjdXIAU3RhdGUgbm90IHJlY292ZXJhYmxlAFByZXZpb3VzIG93bmVyIGRpZWQAT3BlcmF0aW9uIGNhbmNlbGVkAEZ1bmN0aW9uIG5vdCBpbXBsZW1lbnRlZABObyBtZXNzYWdlIG9mIGRlc2lyZWQgdHlwZQBJZGVudGlmaWVyIHJlbW92ZWQARGV2aWNlIG5vdCBhIHN0cmVhbQBObyBkYXRhIGF2YWlsYWJsZQBEZXZpY2UgdGltZW91dABPdXQgb2Ygc3RyZWFtcyByZXNvdXJjZXMATGluayBoYXMgYmVlbiBzZXZlcmVkAFByb3RvY29sIGVycm9yAEJhZCBtZXNzYWdlAEZpbGUgZGVzY3JpcHRvciBpbiBiYWQgc3RhdGUATm90IGEgc29ja2V0AERlc3RpbmF0aW9uIGFkZHJlc3MgcmVxdWlyZWQATWVzc2FnZSB0b28gbGFyZ2UAUHJvdG9jb2wgd3JvbmcgdHlwZSBmb3Igc29ja2V0AFByb3RvY29sIG5vdCBhdmFpbGFibGUAUHJvdG9jb2wgbm90IHN1cHBvcnRlZABTb2NrZXQgdHlwZSBub3Qgc3VwcG9ydGVkAE5vdCBzdXBwb3J0ZWQAUHJvdG9jb2wgZmFtaWx5IG5vdCBzdXBwb3J0ZWQAQWRkcmVzcyBmYW1pbHkgbm90IHN1cHBvcnRlZCBieSBwcm90b2NvbABBZGRyZXNzIG5vdCBhdmFpbGFibGUATmV0d29yayBpcyBkb3duAE5ldHdvcmsgdW5yZWFjaGFibGUAQ29ubmVjdGlvbiByZXNldCBieSBuZXR3b3JrAENvbm5lY3Rpb24gYWJvcnRlZABObyBidWZmZXIgc3BhY2UgYXZhaWxhYmxlAFNvY2tldCBpcyBjb25uZWN0ZWQAU29ja2V0IG5vdCBjb25uZWN0ZWQAQ2Fubm90IHNlbmQgYWZ0ZXIgc29ja2V0IHNodXRkb3duAE9wZXJhdGlvbiBhbHJlYWR5IGluIHByb2dyZXNzAE9wZXJhdGlvbiBpbiBwcm9ncmVzcwBTdGFsZSBmaWxlIGhhbmRsZQBSZW1vdGUgSS9PIGVycm9yAFF1b3RhIGV4Y2VlZGVkAE5vIG1lZGl1bSBmb3VuZABXcm9uZyBtZWRpdW0gdHlwZQBObyBlcnJvciBpbmZvcm1hdGlvbg==";
var tempDoublePtr=STATICTOP;STATICTOP+=16;
var SYSCALLS={varargs:0,get:(function(varargs){SYSCALLS.varargs+=4;var ret=HEAP32[SYSCALLS.varargs-4>>2];return ret}),getStr:(function(){var ret=Pointer_stringify(SYSCALLS.get());return ret}),get64:(function(){var low=SYSCALLS.get(),high=SYSCALLS.get();if(low>=0)assert(high===0);else assert(high===-1);return low}),getZero:(function(){assert(SYSCALLS.get()===0);})};function ___syscall140(which,varargs){SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(),offset_high=SYSCALLS.get(),offset_low=SYSCALLS.get(),result=SYSCALLS.get(),whence=SYSCALLS.get();var offset=offset_low;FS.llseek(stream,offset,whence);HEAP32[result>>2]=stream.position;if(stream.getdents&&offset===0&&whence===0)stream.getdents=null;return 0}catch(e){if(typeof FS==="undefined"||!(e instanceof FS.ErrnoError))abort(e);return -e.errno}}function flush_NO_FILESYSTEM(){var fflush=Module["_fflush"];if(fflush)fflush(0);var printChar=___syscall146.printChar;if(!printChar)return;var buffers=___syscall146.buffers;if(buffers[1].length)printChar(1,10);if(buffers[2].length)printChar(2,10);}function ___syscall146(which,varargs){SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.get(),iov=SYSCALLS.get(),iovcnt=SYSCALLS.get();var ret=0;if(!___syscall146.buffers){___syscall146.buffers=[null,[],[]];___syscall146.printChar=(function(stream,curr){var buffer=___syscall146.buffers[stream];assert(buffer);if(curr===0||curr===10){(stream===1?Module["print"]:Module["printErr"])(UTF8ArrayToString(buffer,0));buffer.length=0;}else {buffer.push(curr);}});}for(var i=0;i<iovcnt;i++){var ptr=HEAP32[iov+i*8>>2];var len=HEAP32[iov+(i*8+4)>>2];for(var j=0;j<len;j++){___syscall146.printChar(stream,HEAPU8[ptr+j]);}ret+=len;}return ret}catch(e){if(typeof FS==="undefined"||!(e instanceof FS.ErrnoError))abort(e);return -e.errno}}function ___syscall54(which,varargs){SYSCALLS.varargs=varargs;try{return 0}catch(e){if(typeof FS==="undefined"||!(e instanceof FS.ErrnoError))abort(e);return -e.errno}}function ___syscall6(which,varargs){SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD();FS.close(stream);return 0}catch(e){if(typeof FS==="undefined"||!(e instanceof FS.ErrnoError))abort(e);return -e.errno}}var cttz_i8=allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0],"i8",ALLOC_STATIC);function _emscripten_memcpy_big(dest,src,num){HEAPU8.set(HEAPU8.subarray(src,src+num),dest);return dest}function ___setErrNo(value){if(Module["___errno_location"])HEAP32[Module["___errno_location"]()>>2]=value;return value}DYNAMICTOP_PTR=staticAlloc(4);STACK_BASE=STACKTOP=alignMemory(STATICTOP);STACK_MAX=STACK_BASE+TOTAL_STACK;DYNAMIC_BASE=alignMemory(STACK_MAX);HEAP32[DYNAMICTOP_PTR>>2]=DYNAMIC_BASE;staticSealed=true;function intArrayToString(array){var ret=[];for(var i=0;i<array.length;i++){var chr=array[i];if(chr>255){chr&=255;}ret.push(String.fromCharCode(chr));}return ret.join("")}var decodeBase64=typeof atob==="function"?atob:(function(input){var keyStr="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";var output="";var chr1,chr2,chr3;var enc1,enc2,enc3,enc4;var i=0;input=input.replace(/[^A-Za-z0-9\+\/\=]/g,"");do{enc1=keyStr.indexOf(input.charAt(i++));enc2=keyStr.indexOf(input.charAt(i++));enc3=keyStr.indexOf(input.charAt(i++));enc4=keyStr.indexOf(input.charAt(i++));chr1=enc1<<2|enc2>>4;chr2=(enc2&15)<<4|enc3>>2;chr3=(enc3&3)<<6|enc4;output=output+String.fromCharCode(chr1);if(enc3!==64){output=output+String.fromCharCode(chr2);}if(enc4!==64){output=output+String.fromCharCode(chr3);}}while(i<input.length);return output});function intArrayFromBase64(s){
		if(typeof ENVIRONMENT_IS_NODE==="boolean"&&ENVIRONMENT_IS_NODE){return DecodeBase64$1();}try{var decoded=decodeBase64(s);var bytes=new Uint8Array(decoded.length);for(var i=0;i<decoded.length;++i){bytes[i]=decoded.charCodeAt(i);}return bytes}catch(_){throw new Error("Converting base64 string to bytes failed.")}}
function tryParseAsDataURI(filename){return intArrayFromBase64(filename.slice(37))}
function invoke_ii(index,a1){try{return Module["dynCall_ii"](index,a1)}catch(e){if(typeof e!=="number"&&e!=="longjmp")throw e;Module["setThrew"](1,0);}}function invoke_iiii(index,a1,a2,a3){try{return Module["dynCall_iiii"](index,a1,a2,a3)}catch(e){if(typeof e!=="number"&&e!=="longjmp")throw e;Module["setThrew"](1,0);}}Module.asmGlobalArg={"Math":Math,"Int8Array":Int8Array,"Int16Array":Int16Array,"Int32Array":Int32Array,"Uint8Array":Uint8Array,"Uint16Array":Uint16Array,"Uint32Array":Uint32Array,"Float32Array":Float32Array,"Float64Array":Float64Array,"NaN":NaN,"Infinity":Infinity};Module.asmLibraryArg={"abort":abort,"assert":assert,"enlargeMemory":enlargeMemory,"getTotalMemory":getTotalMemory,"abortOnCannotGrowMemory":abortOnCannotGrowMemory,"invoke_ii":invoke_ii,"invoke_iiii":invoke_iiii,"___setErrNo":___setErrNo,"___syscall140":___syscall140,"___syscall146":___syscall146,"___syscall54":___syscall54,"___syscall6":___syscall6,"_emscripten_memcpy_big":_emscripten_memcpy_big,"flush_NO_FILESYSTEM":flush_NO_FILESYSTEM,"DYNAMICTOP_PTR":DYNAMICTOP_PTR,"tempDoublePtr":tempDoublePtr,"ABORT":ABORT,"STACKTOP":STACKTOP,"STACK_MAX":STACK_MAX,"cttz_i8":cttz_i8};// EMSCRIPTEN_START_ASM
var asm=(/** @suppress {uselessCode} */ function(global,env,buffer) {
"use asm";var a=new global.Int8Array(buffer);var b=new global.Int16Array(buffer);var c=new global.Int32Array(buffer);var d=new global.Uint8Array(buffer);var e=new global.Uint16Array(buffer);var f=new global.Uint32Array(buffer);var g=new global.Float32Array(buffer);var h=new global.Float64Array(buffer);var i=env.DYNAMICTOP_PTR|0;var j=env.tempDoublePtr|0;var k=env.ABORT|0;var l=env.STACKTOP|0;var m=env.STACK_MAX|0;var n=env.cttz_i8|0;var o=0;var p=0;var q=0;var r=0;var s=global.NaN,t=global.Infinity;var u=0,v=0,w=0,x=0,y=0.0;var z=0;var A=global.Math.floor;var B=global.Math.abs;var C=global.Math.sqrt;var D=global.Math.pow;var E=global.Math.cos;var F=global.Math.sin;var G=global.Math.tan;var H=global.Math.acos;var I=global.Math.asin;var J=global.Math.atan;var K=global.Math.atan2;var L=global.Math.exp;var M=global.Math.log;var N=global.Math.ceil;var O=global.Math.imul;var P=global.Math.min;var Q=global.Math.max;var R=global.Math.clz32;var S=env.abort;var T=env.assert;var U=env.enlargeMemory;var V=env.getTotalMemory;var W=env.abortOnCannotGrowMemory;var X=env.invoke_ii;var Y=env.invoke_iiii;var Z=env.___setErrNo;var _=env.___syscall140;var $=env.___syscall146;var aa=env.___syscall54;var ba=env.___syscall6;var ca=env._emscripten_memcpy_big;var da=env.flush_NO_FILESYSTEM;var ea=0.0;
// EMSCRIPTEN_START_FUNCS
function ha(a){a=a|0;var b=0;b=l;l=l+a|0;l=l+15&-16;return b|0}function ia(){return l|0}function ja(a){a=a|0;l=a;}function ka(a,b){a=a|0;b=b|0;l=a;m=b;}function la(a,b){a=a|0;b=b|0;if(!o){o=a;p=b;}}function ma(a){a=a|0;z=a;}function na(){return z|0}function oa(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0,h=0,i=0;d=d+-1|0;if((d|0)<=-1)return;while(1){i=c[b>>2]|0;h=(i>>>1^i)&572662306;i=h^i;h=i^h<<1;i=(h^i>>>2)&202116108;h=i^h;i=h^i<<2;h=(i^h>>>4)&15728880;i=h^i;h=i^h<<4;i=(h^i>>>8)&65280;g=c[b+4>>2]|0;f=(g>>>1^g)&572662306;g=f^g;f=g^f<<1;g=(f^g>>>2)&202116108;f=g^f;g=f^g<<2;f=(g^f>>>4)&15728880;g=f^g;f=g^f<<4;g=(f^g>>>8)&65280;e=a+4|0;c[a>>2]=((g^f)<<16|i^h&65535)^c[a>>2];c[e>>2]=((i<<8^h)>>>16|g<<8^f&-65536)^c[e>>2];d=d+-1|0;if((d|0)<=-1)break;else {b=b+8|0;a=a+8|0;}}return}function pa(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,i=0,j=0,k=0,m=0,n=0,o=0,p=0;i=l;l=l+16|0;h=i;if(!d){d=e>>>3;oa(a,b,d);f=h;c[f>>2]=0;c[f+4>>2]=0;Bb(h|0,b+(e&-8)|0,e&7|0)|0;e=c[h>>2]|0;b=c[h+4>>2]|0;f=(e>>>1^e)&572662306;e=f^e;f=e^f<<1;e=(f^e>>>2)&202116108;f=e^f;e=f^e<<2;f=(e^f>>>4)&15728880;e=f^e;f=e^f<<4;e=(f^e>>>8)&65280;g=(b>>>1^b)&572662306;b=g^b;g=b^g<<1;b=(g^b>>>2)&202116108;g=b^g;b=g^b<<2;g=(b^g>>>4)&15728880;b=g^b;g=b^g<<4;b=(g^b>>>8)&65280;h=d<<1;d=a+(h<<2)|0;c[d>>2]=((b^g)<<16|e^f&65535)^c[d>>2];h=a+((h|1)<<2)|0;c[h>>2]=((e<<8^f)>>>16|b<<8^g&-65536)^c[h>>2];l=i;return}if(!e){l=i;return}o=d&7;f=d>>>3;g=h+4|0;d=8-o|0;d=d>>>0>e>>>0?e:d;m=h;c[m>>2]=0;c[m+4>>2]=0;Bb(h+o|0,b|0,d|0)|0;o=c[h>>2]|0;m=c[g>>2]|0;n=(o>>>1^o)&572662306;o=n^o;n=o^n<<1;o=(n^o>>>2)&202116108;n=o^n;o=n^o<<2;n=(o^n>>>4)&15728880;o=n^o;n=o^n<<4;o=(n^o>>>8)&65280;k=(m>>>1^m)&572662306;m=k^m;k=m^k<<1;m=(k^m>>>2)&202116108;k=m^k;m=k^m<<2;k=(m^k>>>4)&15728880;m=k^m;k=m^k<<4;m=(k^m>>>8)&65280;j=f<<1;p=a+(j<<2)|0;c[p>>2]=((m^k)<<16|o^n&65535)^c[p>>2];j=a+((j|1)<<2)|0;c[j>>2]=((o<<8^n)>>>16|m<<8^k&-65536)^c[j>>2];e=e-d|0;if(!e){l=i;return}b=b+d|0;while(1){f=f+1|0;d=e>>>0<8?e:8;k=h;c[k>>2]=0;c[k+4>>2]=0;Bb(h|0,b|0,d|0)|0;k=c[h>>2]|0;n=c[g>>2]|0;m=(k>>>1^k)&572662306;k=m^k;m=k^m<<1;k=(m^k>>>2)&202116108;m=k^m;k=m^k<<2;m=(k^m>>>4)&15728880;k=m^k;m=k^m<<4;k=(m^k>>>8)&65280;o=(n>>>1^n)&572662306;n=o^n;o=n^o<<1;n=(o^n>>>2)&202116108;o=n^o;n=o^n<<2;o=(n^o>>>4)&15728880;n=o^n;o=n^o<<4;n=(o^n>>>8)&65280;p=f<<1;j=a+(p<<2)|0;c[j>>2]=((n^o)<<16|k^m&65535)^c[j>>2];p=a+((p|1)<<2)|0;c[p>>2]=((k<<8^m)>>>16|n<<8^o&-65536)^c[p>>2];e=e-d|0;if(!e)break;else b=b+d|0;}l=i;return}function qa(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0,h=0,i=0;d=d+-1|0;if((d|0)<=-1)return;while(1){g=c[a>>2]|0;i=c[a+4>>2]|0;e=g>>>16;h=(i<<8^g)&65280;g=h^(i<<16|g&65535);h=g^h<<8;g=(h^g>>>4)&15728880;h=g^h;g=h^g<<4;h=(g^h>>>2)&202116108;g=h^g;h=g^h<<2;g=(h^g>>>1)&572662306;f=(i>>>8^e)&65280;e=f^(i&-65536|e);f=e^f<<8;e=(f^e>>>4)&15728880;f=e^f;e=f^e<<4;f=(e^f>>>2)&202116108;e=f^e;f=e^f<<2;e=(f^e>>>1)&572662306;c[b>>2]=g^h^g<<1;c[b+4>>2]=e^f^e<<1;d=d+-1|0;if((d|0)<=-1)break;else {b=b+8|0;a=a+8|0;}}return}function ra(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,i=0,j=0,k=0,m=0,n=0,o=0,p=0;i=l;l=l+16|0;h=i;if(!d){j=e>>>3;qa(a,b,j);j=j<<1;f=c[a+(j<<2)>>2]|0;j=c[a+((j|1)<<2)>>2]|0;a=f>>>16;d=(j<<8^f)&65280;f=d^(j<<16|f&65535);d=f^d<<8;f=(d^f>>>4)&15728880;d=f^d;f=d^f<<4;d=(f^d>>>2)&202116108;f=d^f;d=f^d<<2;f=(d^f>>>1)&572662306;g=(j>>>8^a)&65280;a=g^(j&-65536|a);g=a^g<<8;a=(g^a>>>4)&15728880;g=a^g;a=g^a<<4;g=(a^g>>>2)&202116108;a=g^a;g=a^g<<2;a=(g^a>>>1)&572662306;c[h>>2]=f^d^f<<1;c[h+4>>2]=a^g^a<<1;Bb(b+(e&-8)|0,h|0,e&7|0)|0;l=i;return}if(!e){l=i;return}j=d&7;f=d>>>3;g=h+4|0;d=8-j|0;d=d>>>0>e>>>0?e:d;p=f<<1;n=c[a+(p<<2)>>2]|0;p=c[a+((p|1)<<2)>>2]|0;k=n>>>16;o=(p<<8^n)&65280;n=o^(p<<16|n&65535);o=n^o<<8;n=(o^n>>>4)&15728880;o=n^o;n=o^n<<4;o=(n^o>>>2)&202116108;n=o^n;o=n^o<<2;n=(o^n>>>1)&572662306;m=(p>>>8^k)&65280;k=m^(p&-65536|k);m=k^m<<8;k=(m^k>>>4)&15728880;m=k^m;k=m^k<<4;m=(k^m>>>2)&202116108;k=m^k;m=k^m<<2;k=(m^k>>>1)&572662306;c[h>>2]=n^o^n<<1;c[g>>2]=k^m^k<<1;Bb(b|0,h+j|0,d|0)|0;e=e-d|0;if(!e){l=i;return}b=b+d|0;while(1){f=f+1|0;d=e>>>0<8?e:8;k=f<<1;n=c[a+(k<<2)>>2]|0;k=c[a+((k|1)<<2)>>2]|0;p=n>>>16;m=(k<<8^n)&65280;n=m^(k<<16|n&65535);m=n^m<<8;n=(m^n>>>4)&15728880;m=n^m;n=m^n<<4;m=(n^m>>>2)&202116108;n=m^n;m=n^m<<2;n=(m^n>>>1)&572662306;o=(k>>>8^p)&65280;p=o^(k&-65536|p);o=p^o<<8;p=(o^p>>>4)&15728880;o=p^o;p=o^p<<4;o=(p^o>>>2)&202116108;p=o^p;o=p^o<<2;p=(o^p>>>1)&572662306;c[h>>2]=n^m^n<<1;c[g>>2]=p^o^p<<1;Bb(b|0,h|0,d|0)|0;e=e-d|0;if(!e)break;else b=b+d|0;}l=i;return}function sa(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0,h=0,i=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0,D=0,E=0,F=0,G=0,H=0,I=0,J=0,K=0,L=0,M=0,N=0,O=0,P=0,Q=0,R=0,S=0,T=0,U=0,V=0,W=0,X=0,Y=0,Z=0,_=0,$=0,aa=0,ba=0,ca=0,da=0,ea=0,fa=0,ga=0,ha=0,ia=0,ja=0,ka=0,la=0,ma=0,na=0,oa=0,pa=0,qa=0,ra=0,sa=0;g=8+(24-b<<1<<2)|0;f=b&255;switch(f&3){case 1:{ha=a+40|0;ja=c[ha>>2]|0;ga=a+44|0;b=c[ga>>2]|0;d=a+80|0;ia=a+84|0;e=c[ia>>2]|0;c[ga>>2]=c[d>>2];c[ha>>2]=e;ha=a+160|0;e=a+164|0;ga=c[e>>2]|0;c[d>>2]=c[ha>>2];c[ia>>2]=ga;ia=a+120|0;ga=a+124|0;d=c[ga>>2]|0;c[e>>2]=c[ia>>2];c[ha>>2]=d;c[ia>>2]=ja;c[ga>>2]=b;ga=a+8|0;b=c[ga>>2]|0;ia=a+12|0;ja=c[ia>>2]|0;ha=a+48|0;d=a+52|0;e=c[d>>2]|0;c[ga>>2]=c[ha>>2];c[ia>>2]=e;ia=a+128|0;e=a+132|0;ga=c[e>>2]|0;c[d>>2]=c[ia>>2];c[ha>>2]=ga;ha=a+88|0;ga=a+92|0;d=c[ga>>2]|0;c[ia>>2]=c[ha>>2];c[e>>2]=d;c[ga>>2]=b;c[ha>>2]=ja;ha=a+16|0;ja=c[ha>>2]|0;ga=a+20|0;b=c[ga>>2]|0;e=a+96|0;d=a+100|0;ia=c[d>>2]|0;c[ga>>2]=c[e>>2];c[ha>>2]=ia;ha=a+56|0;ia=a+60|0;ga=c[ia>>2]|0;c[e>>2]=c[ha>>2];c[d>>2]=ga;d=a+176|0;ga=a+180|0;e=c[ga>>2]|0;c[ia>>2]=c[d>>2];c[ha>>2]=e;c[d>>2]=ja;c[ga>>2]=b;ga=a+136|0;b=c[ga>>2]|0;d=a+140|0;c[ga>>2]=c[d>>2];c[d>>2]=b;d=a+24|0;b=c[d>>2]|0;ga=a+28|0;ja=c[ga>>2]|0;ha=a+144|0;e=a+148|0;ia=c[e>>2]|0;c[ga>>2]=c[ha>>2];c[d>>2]=ia;d=a+184|0;ia=a+188|0;ga=c[ia>>2]|0;c[ha>>2]=c[d>>2];c[e>>2]=ga;e=a+64|0;ga=a+68|0;ha=c[ga>>2]|0;c[ia>>2]=c[e>>2];c[d>>2]=ha;c[e>>2]=b;c[ga>>2]=ja;ga=a+104|0;ja=c[ga>>2]|0;e=a+108|0;c[ga>>2]=c[e>>2];c[e>>2]=ja;e=a+32|0;ja=c[e>>2]|0;ga=a+36|0;b=c[ga>>2]|0;d=a+192|0;ha=a+196|0;ia=c[ha>>2]|0;c[e>>2]=c[d>>2];c[ga>>2]=ia;ga=a+112|0;ia=a+116|0;e=c[ia>>2]|0;c[ha>>2]=c[ga>>2];c[d>>2]=e;d=a+152|0;e=a+156|0;ha=c[e>>2]|0;c[ga>>2]=c[d>>2];c[ia>>2]=ha;c[e>>2]=ja;e=0;ja=5;break}case 2:{d=a+40|0;b=c[d>>2]|0;ga=a+44|0;ja=c[ga>>2]|0;ia=a+160|0;e=a+164|0;ha=c[e>>2]|0;c[ga>>2]=c[ia>>2];c[d>>2]=ha;c[e>>2]=b;c[ia>>2]=ja;ia=a+80|0;ja=c[ia>>2]|0;e=a+84|0;b=c[e>>2]|0;d=a+120|0;ha=a+124|0;ga=c[ha>>2]|0;c[e>>2]=c[d>>2];c[ia>>2]=ga;c[ha>>2]=ja;c[d>>2]=b;d=a+8|0;b=c[d>>2]|0;ha=a+12|0;ja=c[ha>>2]|0;ia=a+128|0;ga=a+132|0;e=c[ga>>2]|0;c[ha>>2]=c[ia>>2];c[d>>2]=e;c[ga>>2]=b;c[ia>>2]=ja;ia=a+48|0;ja=c[ia>>2]|0;ga=a+52|0;b=c[ga>>2]|0;d=a+88|0;e=a+92|0;ha=c[e>>2]|0;c[ga>>2]=c[d>>2];c[ia>>2]=ha;c[e>>2]=ja;c[d>>2]=b;d=a+16|0;b=c[d>>2]|0;e=a+20|0;ja=c[e>>2]|0;ia=a+56|0;ha=a+60|0;ga=c[ha>>2]|0;c[e>>2]=c[ia>>2];c[d>>2]=ga;c[ha>>2]=b;c[ia>>2]=ja;ia=a+96|0;ja=c[ia>>2]|0;ha=a+100|0;b=c[ha>>2]|0;d=a+176|0;ga=a+180|0;e=c[ga>>2]|0;c[ha>>2]=c[d>>2];c[ia>>2]=e;c[ga>>2]=ja;c[d>>2]=b;d=a+24|0;b=c[d>>2]|0;ga=a+28|0;ja=c[ga>>2]|0;ia=a+184|0;e=a+188|0;ha=c[e>>2]|0;c[ga>>2]=c[ia>>2];c[d>>2]=ha;c[e>>2]=b;c[ia>>2]=ja;ia=a+64|0;ja=c[ia>>2]|0;e=a+68|0;b=c[e>>2]|0;d=a+144|0;ha=a+148|0;ga=c[ha>>2]|0;c[e>>2]=c[d>>2];c[ia>>2]=ga;c[ha>>2]=ja;c[d>>2]=b;d=a+32|0;b=c[d>>2]|0;ha=a+36|0;ja=c[ha>>2]|0;ia=a+112|0;ga=a+116|0;e=c[ga>>2]|0;c[ha>>2]=c[ia>>2];c[d>>2]=e;c[ga>>2]=b;c[ia>>2]=ja;ia=a+152|0;ja=c[ia>>2]|0;ga=a+156|0;b=c[ga>>2]|0;d=a+192|0;e=a+196|0;ha=c[e>>2]|0;c[ga>>2]=c[d>>2];c[ia>>2]=ha;c[e>>2]=ja;e=0;ja=5;break}case 3:{ja=a+40|0;e=c[ja>>2]|0;ia=a+44|0;b=c[ia>>2]|0;ha=a+120|0;ga=a+124|0;d=c[ga>>2]|0;c[ja>>2]=c[ha>>2];c[ia>>2]=d;ia=a+160|0;d=a+164|0;ja=c[d>>2]|0;c[ga>>2]=c[ia>>2];c[ha>>2]=ja;ha=a+80|0;ja=a+84|0;ga=c[ja>>2]|0;c[ia>>2]=c[ha>>2];c[d>>2]=ga;c[ja>>2]=e;c[ha>>2]=b;ha=a+8|0;b=c[ha>>2]|0;ja=a+12|0;e=c[ja>>2]|0;d=a+88|0;ga=a+92|0;ia=c[ga>>2]|0;c[ja>>2]=c[d>>2];c[ha>>2]=ia;ha=a+128|0;ia=a+132|0;ja=c[ia>>2]|0;c[d>>2]=c[ha>>2];c[ga>>2]=ja;ga=a+48|0;ja=a+52|0;d=c[ja>>2]|0;c[ia>>2]=c[ga>>2];c[ha>>2]=d;c[ga>>2]=b;c[ja>>2]=e;ja=a+16|0;e=c[ja>>2]|0;ga=a+20|0;b=c[ga>>2]|0;ha=a+176|0;d=a+180|0;ia=c[d>>2]|0;c[ja>>2]=c[ha>>2];c[ga>>2]=ia;ga=a+56|0;ia=a+60|0;ja=c[ia>>2]|0;c[d>>2]=c[ga>>2];c[ha>>2]=ja;ha=a+96|0;ja=a+100|0;d=c[ja>>2]|0;c[ga>>2]=c[ha>>2];c[ia>>2]=d;c[ja>>2]=e;c[ha>>2]=b;ha=a+136|0;b=c[ha>>2]|0;ja=a+140|0;c[ha>>2]=c[ja>>2];c[ja>>2]=b;ja=a+24|0;b=c[ja>>2]|0;ha=a+28|0;e=c[ha>>2]|0;ia=a+64|0;d=a+68|0;ga=c[d>>2]|0;c[ja>>2]=c[ia>>2];c[ha>>2]=ga;ha=a+184|0;ga=a+188|0;ja=c[ga>>2]|0;c[d>>2]=c[ha>>2];c[ia>>2]=ja;ia=a+144|0;ja=a+148|0;d=c[ja>>2]|0;c[ha>>2]=c[ia>>2];c[ga>>2]=d;c[ja>>2]=b;c[ia>>2]=e;ia=a+104|0;e=c[ia>>2]|0;ja=a+108|0;c[ia>>2]=c[ja>>2];c[ja>>2]=e;ja=a+32|0;e=c[ja>>2]|0;ia=a+36|0;b=c[ia>>2]|0;ga=a+152|0;d=a+156|0;ha=c[d>>2]|0;c[ia>>2]=c[ga>>2];c[ja>>2]=ha;ja=a+112|0;ha=a+116|0;ia=c[ha>>2]|0;c[ga>>2]=c[ja>>2];c[d>>2]=ia;d=a+192|0;ia=c[a+196>>2]|0;c[ha>>2]=c[d>>2];c[ja>>2]=ia;c[d>>2]=e;e=1;ja=5;break}default:{}}if((ja|0)==5)c[d+(e<<2)>>2]=b;o=a+32|0;p=a+72|0;q=a+112|0;r=a+152|0;s=a+192|0;t=a+12|0;u=a+52|0;v=a+92|0;w=a+132|0;x=a+172|0;y=a+36|0;z=a+76|0;A=a+116|0;B=a+156|0;C=a+196|0;D=a+8|0;E=a+48|0;F=a+88|0;G=a+128|0;H=a+168|0;I=a+16|0;J=a+56|0;K=a+96|0;L=a+136|0;M=a+176|0;N=a+20|0;O=a+60|0;P=a+100|0;Q=a+140|0;R=a+180|0;S=a+40|0;T=a+80|0;U=a+120|0;V=a+160|0;W=a+4|0;X=a+44|0;Y=a+84|0;Z=a+124|0;_=a+164|0;$=a+28|0;aa=a+68|0;ba=a+108|0;ca=a+148|0;da=a+188|0;ea=a+24|0;fa=a+64|0;ga=a+104|0;ha=a+144|0;ia=a+184|0;b=f;d=g;a:while(1){switch(b&3){case 0:{ma=c[s>>2]|0;e=c[p>>2]^c[o>>2]^c[q>>2]^c[r>>2]^ma;ja=c[u>>2]^c[t>>2]^c[v>>2]^c[w>>2]^c[x>>2];n=(ja<<1|ja>>>31)^e;ka=c[z>>2]^c[y>>2]^c[A>>2]^c[B>>2]^c[C>>2];m=c[E>>2]|0;l=m^c[D>>2]^c[F>>2]^c[G>>2]^c[H>>2];la=l^ka;g=c[J>>2]^c[I>>2]^c[K>>2]^c[L>>2]^c[M>>2];ka=g^(ka<<1|ka>>>31);oa=c[P>>2]|0;b=c[O>>2]^c[N>>2]^oa^c[Q>>2]^c[R>>2];e=b^e;k=c[a>>2]|0;i=c[S>>2]^k^c[T>>2]^c[U>>2]^c[V>>2];b=i^(b<<1|b>>>31);f=c[W>>2]|0;j=c[X>>2]^f^c[Y>>2]^c[Z>>2]^c[_>>2];g=j^g;na=c[ca>>2]|0;pa=c[aa>>2]^c[$>>2]^c[ba>>2]^na^c[da>>2];l=(pa<<1|pa>>>31)^l;h=c[ha>>2]|0;qa=c[fa>>2]^c[ea>>2]^c[ga>>2]^h^c[ia>>2];ja=qa^ja;j=qa^(j<<1|j>>>31);i=pa^i;k=k^n;m=b^m;m=m<<22|m>>>10;oa=ja^oa;oa=oa<<22|oa>>>10;na=na^e;na=na<<11|na>>>21;ma=j^ma;ma=ma<<7|ma>>>25;pa=oa&~m^k;c[a>>2]=pa;c[a>>2]=pa^c[d>>2];c[E>>2]=na&~oa^m;c[P>>2]=ma&~na^oa;c[ca>>2]=k&~ma^na;c[s>>2]=ma^m&~k;f=f^la;k=c[u>>2]^g;k=k<<22|k>>>10;m=c[K>>2]^l;m=m<<21|m>>>11;h=h^ka;h=h<<10|h>>>22;ma=c[C>>2]^i;ma=ma<<7|ma>>>25;na=m&~k^f;c[W>>2]=na;c[W>>2]=na^c[d+4>>2];c[u>>2]=h&~m^k;c[K>>2]=ma&~h^m;c[ha>>2]=f&~ma^h;c[C>>2]=ma^k&~f;f=c[Y>>2]^la;f=f<<2|f>>>30;k=c[w>>2]^g;k=k<<23|k>>>9;ma=c[R>>2]^ja;ma=ma<<31|ma>>>1;h=c[ea>>2]^ka;h=h<<14|h>>>18;m=c[p>>2]^j;m=m<<10|m>>>22;c[Y>>2]=f&~m^h;c[w>>2]=m^k&~f;c[R>>2]=ma&~k^f;c[ea>>2]=h&~ma^k;c[p>>2]=m&~h^ma;ma=c[T>>2]^n;ma=ma<<1|ma>>>31;h=c[G>>2]^b;h=h<<22|h>>>10;m=c[M>>2]^l;m=m<<30|m>>>2;k=c[$>>2]^e;k=k<<14|k>>>18;f=c[z>>2]^i;f=f<<10|f>>>22;c[T>>2]=ma&~f^k;c[G>>2]=f^h&~ma;c[M>>2]=m&~h^ma;c[$>>2]=k&~m^h;c[z>>2]=f&~k^m;m=c[V>>2]^n;m=m<<9|m>>>23;k=c[t>>2]^g;k=k<<1|k>>>31;f=c[J>>2]^l;f=f<<3|f>>>29;h=c[ba>>2]^e;h=h<<13|h>>>19;ma=c[r>>2]^j;ma=ma<<4|ma>>>28;c[V>>2]=h&~f^k;c[t>>2]=ma&~h^f;c[J>>2]=m&~ma^h;c[ba>>2]=ma^k&~m;c[r>>2]=f&~k^m;m=c[_>>2]^la;m=m<<9|m>>>23;k=c[D>>2]^b;f=c[O>>2]^ja;f=f<<3|f>>>29;ma=c[ga>>2]^ka;ma=ma<<12|ma>>>20;h=c[B>>2]^i;h=h<<4|h>>>28;c[_>>2]=ma&~f^k;c[D>>2]=h&~ma^f;c[O>>2]=m&~h^ma;c[ga>>2]=h^k&~m;c[B>>2]=f&~k^m;m=c[S>>2]^n;m=m<<18|m>>>14;k=c[F>>2]^b;k=k<<5|k>>>27;f=c[Q>>2]^ja;f=f<<8|f>>>24;h=c[ia>>2]^ka;h=h<<28|h>>>4;ma=c[y>>2]^i;ma=ma<<14|ma>>>18;c[S>>2]=ma^k&~m;c[F>>2]=f&~k^m;c[Q>>2]=h&~f^k;c[ia>>2]=ma&~h^f;c[y>>2]=m&~ma^h;h=c[X>>2]^la;h=h<<18|h>>>14;ma=c[v>>2]^g;ma=ma<<5|ma>>>27;m=c[L>>2]^l;m=m<<7|m>>>25;f=c[da>>2]^e;f=f<<28|f>>>4;k=c[o>>2]^j;k=k<<13|k>>>19;c[X>>2]=k^ma&~h;c[v>>2]=m&~ma^h;c[L>>2]=f&~m^ma;m=k&~f^m;c[da>>2]=m;f=h&~k^f;c[o>>2]=f;la=c[Z>>2]^la;la=la<<21|la>>>11;b=c[H>>2]^b;b=b<<1|b>>>31;l=c[I>>2]^l;l=l<<31|l>>>1;e=c[aa>>2]^e;e=e<<28|e>>>4;i=c[A>>2]^i;i=i<<20|i>>>12;k=i&~e^l;c[Z>>2]=k;h=la&~i^e;c[H>>2]=h;i=i^b&~la;c[I>>2]=i;c[aa>>2]=l&~b^la;b=e&~l^b;c[A>>2]=b;n=c[U>>2]^n;n=n<<20|n>>>12;g=c[x>>2]^g;g=g<<1|g>>>31;ja=c[N>>2]^ja;ja=ja<<31|ja>>>1;ka=c[fa>>2]^ka;ka=ka<<27|ka>>>5;j=c[q>>2]^j;j=j<<19|j>>>13;l=j&~ka^ja;c[U>>2]=l;e=n&~j^ka;c[x>>2]=e;j=j^g&~n;c[N>>2]=j;n=ja&~g^n;c[fa>>2]=n;g=ka&~ja^g;c[q>>2]=g;d=d+8|0;ja=12;break}case 3:{b=c[A>>2]|0;e=c[x>>2]|0;f=c[o>>2]|0;g=c[q>>2]|0;h=c[H>>2]|0;i=c[I>>2]|0;j=c[N>>2]|0;k=c[Z>>2]|0;l=c[U>>2]|0;m=c[da>>2]|0;n=c[fa>>2]|0;ja=12;break}case 2:{b=c[B>>2]|0;e=c[x>>2]|0;f=c[s>>2]|0;g=c[r>>2]|0;h=c[H>>2]|0;i=c[P>>2]|0;j=c[K>>2]|0;k=c[X>>2]|0;l=c[S>>2]|0;m=c[fa>>2]|0;n=c[ea>>2]|0;ja=13;break}case 1:{n=d;b=c[o>>2]|0;d=c[x>>2]|0;e=c[A>>2]|0;f=c[y>>2]|0;g=c[H>>2]|0;h=c[O>>2]|0;i=c[J>>2]|0;j=c[T>>2]|0;k=c[Y>>2]|0;l=c[ea>>2]|0;m=c[ca>>2]|0;break}default:{ja=15;break a}}if((ja|0)==12){na=c[p>>2]^c[s>>2]^c[r>>2]^c[y>>2]^b;qa=c[G>>2]^c[u>>2]^c[D>>2]^c[v>>2]^e;e=(qa<<1|qa>>>31)^na;pa=c[z>>2]^c[C>>2]^c[B>>2]^f^g;ma=c[w>>2]|0;ra=ma^c[E>>2]^c[t>>2]^c[F>>2]^h;oa=ra^pa;g=c[R>>2]^c[P>>2]^c[J>>2]^c[Q>>2]^i;pa=g^(pa<<1|pa>>>31);la=c[O>>2]|0;f=c[M>>2]^c[K>>2]^la^c[L>>2]^j;h=f^na;na=c[a>>2]|0;i=c[Y>>2]^na^c[V>>2]^c[S>>2]^k;k=i^(f<<1|f>>>31);f=c[W>>2]|0;j=c[T>>2]^f^c[_>>2]^c[X>>2]^l;g=j^g;ka=c[$>>2]^c[ha>>2]^c[ga>>2]^m^n;n=(ka<<1|ka>>>31)^ra;l=c[ia>>2]|0;ra=c[ea>>2]^c[ca>>2]^c[ba>>2]^l^c[aa>>2];qa=ra^qa;j=ra^(j<<1|j>>>31);i=ka^i;na=na^e;ma=k^ma;ma=ma<<22|ma>>>10;la=qa^la;la=la<<22|la>>>10;m=m^h;m=m<<11|m>>>21;b=j^b;b=b<<7|b>>>25;ka=la&~ma^na;c[a>>2]=ka;c[a>>2]=ka^c[d>>2];c[w>>2]=m&~la^ma;c[O>>2]=b&~m^la;c[da>>2]=na&~b^m;c[A>>2]=b^ma&~na;f=f^oa;b=c[G>>2]^g;b=b<<22|b>>>10;m=c[J>>2]^n;m=m<<21|m>>>11;l=l^pa;l=l<<10|l>>>22;na=c[q>>2]^i;na=na<<7|na>>>25;ma=m&~b^f;c[W>>2]=ma;c[W>>2]=ma^c[d+4>>2];c[G>>2]=l&~m^b;c[J>>2]=na&~l^m;c[ia>>2]=f&~na^l;c[q>>2]=na^b&~f;f=c[_>>2]^oa;f=f<<2|f>>>30;b=c[v>>2]^g;b=b<<23|b>>>9;na=c[N>>2]^qa;na=na<<31|na>>>1;l=c[ca>>2]^pa;l=l<<14|l>>>18;m=c[p>>2]^j;m=m<<10|m>>>22;c[_>>2]=f&~m^l;c[v>>2]=m^b&~f;c[N>>2]=na&~b^f;c[ca>>2]=l&~na^b;c[p>>2]=m&~l^na;na=c[V>>2]^e;na=na<<1|na>>>31;l=c[F>>2]^k;l=l<<22|l>>>10;m=c[I>>2]^n;m=m<<30|m>>>2;b=c[ha>>2]^h;b=b<<14|b>>>18;f=c[z>>2]^i;f=f<<10|f>>>22;c[V>>2]=na&~f^b;c[F>>2]=f^l&~na;c[I>>2]=m&~l^na;c[ha>>2]=b&~m^l;c[z>>2]=f&~b^m;m=c[Z>>2]^e;m=m<<9|m>>>23;b=c[u>>2]^g;b=b<<1|b>>>31;f=c[R>>2]^n;f=f<<3|f>>>29;l=c[ga>>2]^h;l=l<<13|l>>>19;na=c[y>>2]^j;na=na<<4|na>>>28;c[Z>>2]=l&~f^b;c[u>>2]=na&~l^f;c[R>>2]=m&~na^l;c[ga>>2]=na^b&~m;c[y>>2]=f&~b^m;m=c[U>>2]^oa;m=m<<9|m>>>23;b=c[E>>2]^k;f=c[M>>2]^qa;f=f<<3|f>>>29;na=c[ba>>2]^pa;na=na<<12|na>>>20;l=c[o>>2]^i;l=l<<4|l>>>28;c[U>>2]=na&~f^b;c[E>>2]=l&~na^f;c[M>>2]=m&~l^na;c[ba>>2]=l^b&~m;c[o>>2]=f&~b^m;m=c[Y>>2]^e;m=m<<18|m>>>14;b=c[t>>2]^k;b=b<<5|b>>>27;f=c[L>>2]^qa;f=f<<8|f>>>24;l=c[aa>>2]^pa;l=l<<28|l>>>4;na=c[C>>2]^i;na=na<<14|na>>>18;c[Y>>2]=na^b&~m;c[t>>2]=f&~b^m;c[L>>2]=l&~f^b;c[aa>>2]=na&~l^f;c[C>>2]=m&~na^l;l=c[T>>2]^oa;l=l<<18|l>>>14;na=c[D>>2]^g;na=na<<5|na>>>27;m=c[Q>>2]^n;m=m<<7|m>>>25;f=c[fa>>2]^h;f=f<<28|f>>>4;b=c[s>>2]^j;b=b<<13|b>>>19;c[T>>2]=b^na&~l;c[D>>2]=m&~na^l;c[Q>>2]=f&~m^na;m=b&~f^m;c[fa>>2]=m;f=l&~b^f;c[s>>2]=f;oa=c[X>>2]^oa;oa=oa<<21|oa>>>11;b=c[H>>2]^k;b=b<<1|b>>>31;n=c[P>>2]^n;n=n<<31|n>>>1;l=c[$>>2]^h;l=l<<28|l>>>4;i=c[B>>2]^i;i=i<<20|i>>>12;k=i&~l^n;c[X>>2]=k;h=oa&~i^l;c[H>>2]=h;i=i^b&~oa;c[P>>2]=i;c[$>>2]=n&~b^oa;b=l&~n^b;c[B>>2]=b;n=c[S>>2]^e;n=n<<20|n>>>12;g=c[x>>2]^g;g=g<<1|g>>>31;qa=c[K>>2]^qa;qa=qa<<31|qa>>>1;pa=c[ea>>2]^pa;pa=pa<<27|pa>>>5;j=c[r>>2]^j;j=j<<19|j>>>13;l=j&~pa^qa;c[S>>2]=l;e=n&~j^pa;c[x>>2]=e;j=j^g&~n;c[K>>2]=j;n=qa&~g^n;c[ea>>2]=n;g=pa&~qa^g;c[r>>2]=g;d=d+8|0;ja=13;}if((ja|0)==13){ja=0;la=c[p>>2]^c[A>>2]^c[y>>2]^c[C>>2]^b;sa=c[F>>2]^c[G>>2]^c[E>>2]^c[D>>2]^e;ra=(sa<<1|sa>>>31)^la;qa=c[z>>2]^c[q>>2]^c[o>>2]^f^g;na=c[v>>2]|0;oa=na^c[w>>2]^c[u>>2]^c[t>>2]^h;pa=oa^qa;f=c[N>>2]^c[O>>2]^c[R>>2]^c[L>>2]^i;qa=f^(qa<<1|qa>>>31);ma=c[M>>2]|0;g=c[I>>2]^c[J>>2]^ma^c[Q>>2]^j;j=g^la;la=c[a>>2]|0;h=c[_>>2]^la^c[Z>>2]^c[Y>>2]^k;g=h^(g<<1|g>>>31);e=c[W>>2]|0;i=c[V>>2]^e^c[U>>2]^c[T>>2]^l;f=i^f;l=c[ha>>2]^c[ia>>2]^c[ba>>2]^m^n;k=(l<<1|l>>>31)^oa;oa=c[aa>>2]|0;ka=c[ca>>2]^c[da>>2]^c[ga>>2]^oa^c[$>>2];n=ka^sa;i=ka^(i<<1|i>>>31);h=l^h;l=la^ra;na=g^na;na=na<<22|na>>>10;ma=n^ma;ma=ma<<22|ma>>>10;m=m^j;m=m<<11|m>>>21;b=i^b;b=b<<7|b>>>25;la=ma&~na^l;c[a>>2]=la;c[a>>2]=la^c[d>>2];c[v>>2]=m&~ma^na;c[M>>2]=b&~m^ma;c[fa>>2]=l&~b^m;c[B>>2]=b^na&~l;e=e^pa;b=c[F>>2]^f;b=b<<22|b>>>10;l=c[R>>2]^k;l=l<<21|l>>>11;m=oa^qa;m=m<<10|m>>>22;oa=c[r>>2]^h;oa=oa<<7|oa>>>25;na=l&~b^e;c[W>>2]=na;c[W>>2]=na^c[d+4>>2];c[F>>2]=m&~l^b;c[R>>2]=oa&~m^l;c[aa>>2]=e&~oa^m;c[r>>2]=oa^b&~e;e=c[U>>2]^pa;e=e<<2|e>>>30;b=c[D>>2]^f;b=b<<23|b>>>9;oa=c[K>>2]^n;oa=oa<<31|oa>>>1;m=c[da>>2]^qa;m=m<<14|m>>>18;l=c[p>>2]^i;l=l<<10|l>>>22;c[U>>2]=e&~l^m;c[D>>2]=l^b&~e;c[K>>2]=oa&~b^e;c[da>>2]=m&~oa^b;c[p>>2]=l&~m^oa;oa=c[Z>>2]^ra;oa=oa<<1|oa>>>31;m=c[t>>2]^g;m=m<<22|m>>>10;l=c[P>>2]^k;l=l<<30|l>>>2;b=c[ia>>2]^j;b=b<<14|b>>>18;e=c[z>>2]^h;e=e<<10|e>>>22;c[Z>>2]=oa&~e^b;c[t>>2]=e^m&~oa;c[P>>2]=l&~m^oa;c[ia>>2]=b&~l^m;c[z>>2]=e&~b^l;l=c[X>>2]^ra;l=l<<9|l>>>23;b=c[G>>2]^f;b=b<<1|b>>>31;e=c[N>>2]^k;e=e<<3|e>>>29;m=c[ba>>2]^j;m=m<<13|m>>>19;oa=c[C>>2]^i;oa=oa<<4|oa>>>28;c[X>>2]=m&~e^b;c[G>>2]=oa&~m^e;c[N>>2]=l&~oa^m;c[ba>>2]=oa^b&~l;c[C>>2]=e&~b^l;l=c[S>>2]^pa;l=l<<9|l>>>23;b=c[w>>2]^g;e=c[I>>2]^n;e=e<<3|e>>>29;oa=c[ga>>2]^qa;oa=oa<<12|oa>>>20;m=c[s>>2]^h;m=m<<4|m>>>28;c[S>>2]=oa&~e^b;c[w>>2]=m&~oa^e;c[I>>2]=l&~m^oa;c[ga>>2]=m^b&~l;c[s>>2]=e&~b^l;l=c[_>>2]^ra;l=l<<18|l>>>14;b=c[u>>2]^g;b=b<<5|b>>>27;e=c[Q>>2]^n;e=e<<8|e>>>24;m=c[$>>2]^qa;m=m<<28|m>>>4;oa=c[q>>2]^h;oa=oa<<14|oa>>>18;c[_>>2]=oa^b&~l;c[u>>2]=e&~b^l;c[Q>>2]=m&~e^b;c[$>>2]=oa&~m^e;c[q>>2]=l&~oa^m;m=c[V>>2]^pa;m=m<<18|m>>>14;oa=c[E>>2]^f;oa=oa<<5|oa>>>27;l=c[L>>2]^k;l=l<<7|l>>>25;e=c[ea>>2]^j;e=e<<28|e>>>4;b=c[A>>2]^i;b=b<<13|b>>>19;c[V>>2]=b^oa&~m;c[E>>2]=l&~oa^m;c[L>>2]=e&~l^oa;l=b&~e^l;c[ea>>2]=l;e=m&~b^e;c[A>>2]=e;pa=c[T>>2]^pa;pa=pa<<21|pa>>>11;b=c[H>>2]^g;b=b<<1|b>>>31;m=c[O>>2]^k;m=m<<31|m>>>1;k=c[ha>>2]^j;k=k<<28|k>>>4;h=c[o>>2]^h;h=h<<20|h>>>12;j=h&~k^m;c[T>>2]=j;g=pa&~h^k;c[H>>2]=g;h=h^b&~pa;c[O>>2]=h;c[ha>>2]=m&~b^pa;b=k&~m^b;c[o>>2]=b;m=c[Y>>2]^ra;m=m<<20|m>>>12;f=c[x>>2]^f;f=f<<1|f>>>31;n=c[J>>2]^n;n=n<<31|n>>>1;qa=c[ca>>2]^qa;qa=qa<<27|qa>>>5;i=c[y>>2]^i;i=i<<19|i>>>13;k=i&~qa^n;c[Y>>2]=k;ra=m&~i^qa;c[x>>2]=ra;i=i^f&~m;c[J>>2]=i;m=n&~f^m;c[ca>>2]=m;f=qa&~n^f;c[y>>2]=f;n=d+8|0;d=ra;}la=c[p>>2]^c[B>>2]^c[C>>2]^c[q>>2]^b;ra=c[t>>2]^c[F>>2]^c[w>>2]^c[E>>2]^d;pa=(ra<<1|ra>>>31)^la;qa=c[z>>2]^c[r>>2]^c[s>>2]^e^f;f=c[D>>2]|0;ma=f^c[v>>2]^c[G>>2]^c[u>>2]^g;ka=ma^qa;sa=c[K>>2]^c[M>>2]^c[N>>2]^c[Q>>2]^h;qa=sa^(qa<<1|qa>>>31);d=c[I>>2]|0;na=c[P>>2]^c[R>>2]^d^c[L>>2]^i;la=na^la;h=c[a>>2]|0;g=c[U>>2]^h^c[X>>2]^c[_>>2]^j;na=g^(na<<1|na>>>31);i=c[W>>2]|0;oa=c[Z>>2]^i^c[S>>2]^c[V>>2]^k;sa=oa^sa;m=c[ia>>2]^c[aa>>2]^c[ga>>2]^l^m;ma=(m<<1|m>>>31)^ma;j=c[$>>2]|0;k=c[da>>2]^c[fa>>2]^c[ba>>2]^j^c[ha>>2];ra=k^ra;oa=k^(oa<<1|oa>>>31);m=m^g;h=h^pa;k=na^f;k=k<<22|k>>>10;d=ra^d;d=d<<22|d>>>10;g=l^la;g=g<<11|g>>>21;l=oa^b;l=l<<7|l>>>25;f=d&~k^h;c[a>>2]=f;c[a>>2]=f^c[n>>2];c[D>>2]=g&~d^k;c[I>>2]=l&~g^d;c[ea>>2]=h&~l^g;c[o>>2]=l^k&~h;l=i^ka;i=c[t>>2]^sa;i=i<<22|i>>>10;h=c[N>>2]^ma;h=h<<21|h>>>11;j=j^qa;j=j<<10|j>>>22;k=c[y>>2]^m;k=k<<7|k>>>25;g=h&~i^l;c[W>>2]=g;d=n+8|0;c[W>>2]=g^c[n+4>>2];c[t>>2]=j&~h^i;c[N>>2]=k&~j^h;c[$>>2]=l&~k^j;c[y>>2]=k^i&~l;n=c[S>>2]^ka;n=n<<2|n>>>30;l=c[E>>2]^sa;l=l<<23|l>>>9;i=c[J>>2]^ra;i=i<<31|i>>>1;k=c[fa>>2]^qa;k=k<<14|k>>>18;j=c[p>>2]^oa;j=j<<10|j>>>22;c[S>>2]=n&~j^k;c[E>>2]=j^l&~n;c[J>>2]=i&~l^n;c[fa>>2]=k&~i^l;c[p>>2]=j&~k^i;i=c[X>>2]^pa;i=i<<1|i>>>31;k=c[u>>2]^na;k=k<<22|k>>>10;j=c[O>>2]^ma;j=j<<30|j>>>2;l=c[aa>>2]^la;l=l<<14|l>>>18;n=c[z>>2]^m;n=n<<10|n>>>22;c[X>>2]=i&~n^l;c[u>>2]=n^k&~i;c[O>>2]=j&~k^i;c[aa>>2]=l&~j^k;c[z>>2]=n&~l^j;j=c[T>>2]^pa;j=j<<9|j>>>23;l=c[F>>2]^sa;l=l<<1|l>>>31;n=c[K>>2]^ma;n=n<<3|n>>>29;k=c[ga>>2]^la;k=k<<13|k>>>19;i=c[q>>2]^oa;i=i<<4|i>>>28;c[T>>2]=k&~n^l;c[F>>2]=i&~k^n;c[K>>2]=j&~i^k;c[ga>>2]=i^l&~j;c[q>>2]=n&~l^j;j=c[Y>>2]^ka;j=j<<9|j>>>23;l=c[v>>2]^na;n=c[P>>2]^ra;n=n<<3|n>>>29;i=c[ba>>2]^qa;i=i<<12|i>>>20;k=c[A>>2]^m;k=k<<4|k>>>28;c[Y>>2]=i&~n^l;c[v>>2]=k&~i^n;c[P>>2]=j&~k^i;c[ba>>2]=k^l&~j;c[A>>2]=n&~l^j;j=c[U>>2]^pa;j=j<<18|j>>>14;l=c[G>>2]^na;l=l<<5|l>>>27;n=c[L>>2]^ra;n=n<<8|n>>>24;k=c[ha>>2]^qa;k=k<<28|k>>>4;i=c[r>>2]^m;i=i<<14|i>>>18;c[U>>2]=i^l&~j;c[G>>2]=n&~l^j;c[L>>2]=k&~n^l;c[ha>>2]=i&~k^n;c[r>>2]=j&~i^k;k=c[Z>>2]^ka;k=k<<18|k>>>14;i=c[w>>2]^sa;i=i<<5|i>>>27;j=c[Q>>2]^ma;j=j<<7|j>>>25;n=c[ca>>2]^la;n=n<<28|n>>>4;l=c[B>>2]^oa;l=l<<13|l>>>19;c[Z>>2]=l^i&~k;c[w>>2]=j&~i^k;c[Q>>2]=n&~j^i;c[ca>>2]=l&~n^j;c[B>>2]=k&~l^n;ka=c[V>>2]^ka;ka=ka<<21|ka>>>11;na=c[H>>2]^na;na=na<<1|na>>>31;ma=c[M>>2]^ma;ma=ma<<31|ma>>>1;la=c[ia>>2]^la;la=la<<28|la>>>4;n=c[s>>2]^m;n=n<<20|n>>>12;c[V>>2]=n&~la^ma;c[H>>2]=ka&~n^la;c[M>>2]=n^na&~ka;c[ia>>2]=ma&~na^ka;c[s>>2]=la&~ma^na;pa=c[_>>2]^pa;pa=pa<<20|pa>>>12;sa=c[x>>2]^sa;sa=sa<<1|sa>>>31;ra=c[R>>2]^ra;ra=ra<<31|ra>>>1;qa=c[da>>2]^qa;qa=qa<<27|qa>>>5;oa=c[C>>2]^oa;oa=oa<<19|oa>>>13;c[_>>2]=oa&~qa^ra;c[x>>2]=pa&~oa^qa;c[R>>2]=oa^sa&~pa;c[da>>2]=ra&~sa^pa;c[C>>2]=qa&~ra^sa;if((c[d>>2]|0)==255){ja=16;break}else b=0;}if((ja|0)!=15)if((ja|0)==16)return}function ta(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0,h=0,i=0,j=0,k=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0;r=l;l=l+16|0;p=r;e=c[a+200>>2]|0;q=e>>>3;if(c[a+208>>2]|0){q=1;l=r;return q|0}if(!d){q=0;l=r;return q|0}o=a+204|0;i=e>>>6;j=q&536870904;k=q&7;h=p+4|0;n=i<<1;m=a+(n<<2)|0;n=a+((n|1)<<2)|0;e=b;f=0;while(1){g=c[o>>2]|0;b=d-f|0;if((f+q|0)>>>0>d>>>0|(g|0)!=0){s=(g+b|0)>>>0>q>>>0?q-g|0:b;b=s+f|0;pa(a,e,g,s);e=e+s|0;g=(c[o>>2]|0)+s|0;c[o>>2]=g;if((g|0)==(q|0)){sa(a,12);c[o>>2]=0;}}else {if(b>>>0>=q>>>0)do{oa(a,e,i);t=p;c[t>>2]=0;c[t+4>>2]=0;Bb(p|0,e+j|0,k|0)|0;t=c[p>>2]|0;g=c[h>>2]|0;f=(t>>>1^t)&572662306;t=f^t;f=t^f<<1;t=(f^t>>>2)&202116108;f=t^f;t=f^t<<2;f=(t^f>>>4)&15728880;t=f^t;f=t^f<<4;t=(f^t>>>8)&65280;s=(g>>>1^g)&572662306;g=s^g;s=g^s<<1;g=(s^g>>>2)&202116108;s=g^s;g=s^g<<2;s=(g^s>>>4)&15728880;g=s^g;s=g^s<<4;g=(s^g>>>8)&65280;c[m>>2]=((g^s)<<16|t^f&65535)^c[m>>2];c[n>>2]=((t<<8^f)>>>16|g<<8^s&-65536)^c[n>>2];sa(a,12);e=e+q|0;b=b-q|0;}while(b>>>0>=q>>>0);b=d-b|0;}if(b>>>0<d>>>0)f=b;else {e=0;break}}l=r;return e|0}function ua(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0,h=0,i=0,j=0,k=0,l=0;d=(c[a+200>>2]|0)>>>3;if(!(b<<24>>24)){f=1;return f|0}e=a+208|0;if(c[e>>2]|0){f=1;return f|0}f=a+204|0;g=c[f>>2]|0;k=g&7;h=k>>>0<4;j=b&255;k=k<<3;i=h?0:j<<k+-32;k=h?j<<k:0;j=(k>>>1^k)&572662306;k=j^k;j=k^j<<1;k=(j^k>>>2)&202116108;j=k^j;k=j^k<<2;j=(k^j>>>4)&15728880;k=j^k;j=k^j<<4;k=(j^k>>>8)&65280;h=(i>>>1^i)&572662306;i=h^i;h=i^h<<1;i=(h^i>>>2)&202116108;h=i^h;i=h^i<<2;h=(i^h>>>4)&15728880;i=h^i;h=i^h<<4;i=(h^i>>>8)&65280;g=g>>>3<<1;l=a+(g<<2)|0;c[l>>2]=((i^h)<<16|k^j&65535)^c[l>>2];g=a+((g|1)<<2)|0;c[g>>2]=((k<<8^j)>>>16|i<<8^h&-65536)^c[g>>2];if(b<<24>>24<0){b=d+-1|0;if((c[f>>2]|0)==(b|0))sa(a,12);}else b=d+-1|0;h=b&7;i=h>>>0<4;h=h<<3;j=i?0:128<<h+-32;h=i?128<<h:0;i=(h>>>1^h)&572662306;h=i^h;i=h^i<<1;h=(i^h>>>2)&202116108;i=h^i;h=i^h<<2;i=(h^i>>>4)&15728880;h=i^h;i=h^i<<4;h=(i^h>>>8)&65280;k=(j>>>1^j)&572662306;j=k^j;k=j^k<<1;j=(k^j>>>2)&202116108;k=j^k;j=k^j<<2;k=(j^k>>>4)&15728880;j=k^j;k=j^k<<4;j=(k^j>>>8)&65280;l=b>>>3<<1;g=a+(l<<2)|0;c[g>>2]=c[g>>2]^((j^k)<<16|h^i&65535);l=a+((l|1)<<2)|0;c[l>>2]=c[l>>2]^((h<<8^i)>>>16|j<<8^k&-65536);sa(a,12);c[f>>2]=0;c[e>>2]=1;l=0;return l|0}function va(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0,h=0,i=0,j=0,k=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0;q=l;l=l+16|0;o=q;e=c[a+200>>2]|0;p=e>>>3;if(!(c[a+208>>2]|0))ua(a,1)|0;if(!d){l=q;return 0}n=a+204|0;h=e>>>6;i=p&536870904;j=p&7;m=h<<1;k=a+(m<<2)|0;m=a+((m|1)<<2)|0;g=o+4|0;e=0;f=b;do{b=c[n>>2]|0;if((e+p|0)>>>0>d>>>0|(b|0)!=(p|0)){if((b|0)==(p|0)){sa(a,12);c[n>>2]=0;b=0;}r=d-e|0;r=(b+r|0)>>>0>p>>>0?p-b|0:r;ra(a,f,b,r);c[n>>2]=r+(c[n>>2]|0);f=f+r|0;e=r+e|0;}else {e=d-e|0;if(e>>>0<p>>>0){b=e;e=f;}else {b=e;e=f;do{sa(a,12);qa(a,e,h);s=c[k>>2]|0;u=c[m>>2]|0;r=s>>>16;t=(u<<8^s)&65280;s=t^(u<<16|s&65535);t=s^t<<8;s=(t^s>>>4)&15728880;t=s^t;s=t^s<<4;t=(s^t>>>2)&202116108;s=t^s;t=s^t<<2;s=(t^s>>>1)&572662306;f=(u>>>8^r)&65280;r=f^(u&-65536|r);f=r^f<<8;r=(f^r>>>4)&15728880;f=r^f;r=f^r<<4;f=(r^f>>>2)&202116108;r=f^r;f=r^f<<2;r=(f^r>>>1)&572662306;c[o>>2]=s^t^s<<1;c[g>>2]=r^f^r<<1;Bb(e+i|0,o|0,j|0)|0;e=e+p|0;b=b-p|0;}while(b>>>0>=p>>>0)}f=e;e=d-b|0;}}while(e>>>0<d>>>0);l=q;return 0}function wa(a,b){a=a|0;b=b|0;c[a+428>>2]=b;c[a+436>>2]=0;c[a+432>>2]=0;c[a+440>>2]=1;Cb(a+216|0,0,200)|0;c[a+416>>2]=1344;c[a+420>>2]=0;c[a+424>>2]=0;return 0}function xa(b,d,e){b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,i=0,j=0,k=0,m=0,n=0,o=0;o=l;l=l+32|0;m=o;if((c[b+440>>2]|0)!=1){n=1;l=o;return n|0}n=b+432|0;k=b+436|0;f=c[k>>2]|0;do if(!(c[n>>2]|0)){g=8192-f|0;g=g>>>0>e>>>0?e:g;h=b+216|0;if(ta(h,d,g)|0){n=1;l=o;return n|0}f=d+g|0;e=e-g|0;j=(c[k>>2]|0)+g|0;c[k>>2]=j;if((e|0)!=0&(j|0)==8192){a[m>>0]=3;c[k>>2]=0;c[n>>2]=1;if(!(ta(h,m,1)|0)){j=b+420|0;c[j>>2]=(c[j>>2]|0)+7&-8;break}n=1;l=o;return n|0}else i=15;}else if(f){g=8192-f|0;g=g>>>0>e>>>0?e:g;if(ta(b,d,g)|0){n=1;l=o;return n|0}f=d+g|0;e=e-g|0;j=(c[k>>2]|0)+g|0;c[k>>2]=j;if((j|0)==8192){c[k>>2]=0;c[n>>2]=(c[n>>2]|0)+1;if((ua(b,11)|0)==0?(va(b,m,32)|0,(ta(b+216|0,m,32)|0)==0):0){i=15;break}n=1;l=o;return n|0}else i=15;}else {f=d;i=15;}while(0);if((i|0)==15)if(!e){n=0;l=o;return n|0}d=b+200|0;h=b+204|0;i=b+208|0;j=b+216|0;while(1){g=e>>>0<8192?e:8192;Cb(b|0,0,200)|0;c[d>>2]=1344;c[h>>2]=0;c[i>>2]=0;if(ta(b,f,g)|0){e=1;i=25;break}f=f+g|0;if(e>>>0>8191){c[n>>2]=(c[n>>2]|0)+1;if(ua(b,11)|0){i=21;break}va(b,m,32)|0;if(ta(j,m,32)|0){i=21;break}}else c[k>>2]=g;e=e-g|0;if(!e){e=0;i=25;break}}if((i|0)==21){n=1;l=o;return n|0}else if((i|0)==25){l=o;return e|0}return 0}function ya(b,d,e,f){b=b|0;d=d|0;e=e|0;f=f|0;var g=0,h=0,i=0,j=0,k=0;k=l;l=l+48|0;i=k+32|0;h=k;j=b+440|0;if((c[j>>2]|0)!=1){j=1;l=k;return j|0}if(!f)e=0;else {if(!(xa(b,e,f)|0)){e=0;g=f;}else {j=1;l=k;return j|0}do{e=e+1|0;g=g>>>8;}while((g|0)!=0&e>>>0<4);g=1;do{a[i+(g+-1)>>0]=f>>>(e-g<<3);g=g+1|0;}while(e>>>0>=g>>>0)}a[i+e>>0]=e;if(xa(b,i,e+1|0)|0){j=1;l=k;return j|0}g=b+432|0;e=c[g>>2]|0;if(e){do if(c[b+436>>2]|0){c[g>>2]=e+1;if((ua(b,11)|0)==0?(va(b,h,32)|0,(ta(b+216|0,h,32)|0)==0):0){e=c[g>>2]|0;break}j=1;l=k;return j|0}while(0);f=e+-1|0;c[g>>2]=f;if(!f)e=0;else {e=0;g=f;do{e=e+1|0;g=g>>>8;}while((g|0)!=0&e>>>0<4);g=1;do{a[i+(g+-1)>>0]=f>>>(e-g<<3);g=g+1|0;}while(e>>>0>=g>>>0)}a[i+e>>0]=e;a[i+(e+1)>>0]=-1;a[i+(e+2)>>0]=-1;g=b+216|0;if(!(ta(g,i,e+3|0)|0))e=6;else {j=1;l=k;return j|0}}else {e=7;g=b+216|0;}if(ua(g,e)|0){j=1;l=k;return j|0}e=c[b+428>>2]|0;if(!e){c[j>>2]=3;j=0;l=k;return j|0}else {c[j>>2]=2;va(g,d,e)|0;j=0;l=k;return j|0}return 0}function za(a,b,d){a=a|0;b=b|0;d=d|0;if((c[a+440>>2]|0)!=3){d=1;return d|0}va(a+216|0,b,d)|0;d=0;return d|0}function Aa(){return Ea(448)|0}function Ba(a){a=a|0;if(!a){a=0;return a|0}a=(c[a+440>>2]|0)==3&1;return a|0}function Ca(a){a=a|0;if(!a){a=0;return a|0}a=(c[a+440>>2]|0)==1&1;return a|0}function Da(a){a=a|0;var b=0,d=0,e=0;d=l;l=l+16|0;e=d;b=a+440|0;c[e>>2]=c[b>>2];qb(576,e)|0;if(!a){e=0;l=d;return e|0}e=c[b>>2]|0;l=d;return e|0}function Ea(a){a=a|0;var b=0,d=0,e=0,f=0,g=0,h=0,i=0,j=0,k=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0;x=l;l=l+16|0;p=x;do if(a>>>0<245){m=a>>>0<11?16:a+11&-8;a=m>>>3;o=c[753]|0;d=o>>>a;if(d&3|0){b=(d&1^1)+a|0;a=3052+(b<<1<<2)|0;d=a+8|0;e=c[d>>2]|0;f=e+8|0;g=c[f>>2]|0;if((g|0)==(a|0))c[753]=o&~(1<<b);else {c[g+12>>2]=a;c[d>>2]=g;}w=b<<3;c[e+4>>2]=w|3;w=e+w+4|0;c[w>>2]=c[w>>2]|1;w=f;l=x;return w|0}n=c[755]|0;if(m>>>0>n>>>0){if(d|0){b=2<<a;b=d<<a&(b|0-b);b=(b&0-b)+-1|0;i=b>>>12&16;b=b>>>i;d=b>>>5&8;b=b>>>d;g=b>>>2&4;b=b>>>g;a=b>>>1&2;b=b>>>a;e=b>>>1&1;e=(d|i|g|a|e)+(b>>>e)|0;b=3052+(e<<1<<2)|0;a=b+8|0;g=c[a>>2]|0;i=g+8|0;d=c[i>>2]|0;if((d|0)==(b|0)){a=o&~(1<<e);c[753]=a;}else {c[d+12>>2]=b;c[a>>2]=d;a=o;}w=e<<3;h=w-m|0;c[g+4>>2]=m|3;f=g+m|0;c[f+4>>2]=h|1;c[g+w>>2]=h;if(n|0){e=c[758]|0;b=n>>>3;d=3052+(b<<1<<2)|0;b=1<<b;if(!(a&b)){c[753]=a|b;b=d;a=d+8|0;}else {a=d+8|0;b=c[a>>2]|0;}c[a>>2]=e;c[b+12>>2]=e;c[e+8>>2]=b;c[e+12>>2]=d;}c[755]=h;c[758]=f;w=i;l=x;return w|0}j=c[754]|0;if(j){d=(j&0-j)+-1|0;i=d>>>12&16;d=d>>>i;h=d>>>5&8;d=d>>>h;k=d>>>2&4;d=d>>>k;e=d>>>1&2;d=d>>>e;a=d>>>1&1;a=c[3316+((h|i|k|e|a)+(d>>>a)<<2)>>2]|0;d=(c[a+4>>2]&-8)-m|0;e=c[a+16+(((c[a+16>>2]|0)==0&1)<<2)>>2]|0;if(!e){k=a;h=d;}else {do{i=(c[e+4>>2]&-8)-m|0;k=i>>>0<d>>>0;d=k?i:d;a=k?e:a;e=c[e+16+(((c[e+16>>2]|0)==0&1)<<2)>>2]|0;}while((e|0)!=0);k=a;h=d;}i=k+m|0;if(i>>>0>k>>>0){f=c[k+24>>2]|0;b=c[k+12>>2]|0;do if((b|0)==(k|0)){a=k+20|0;b=c[a>>2]|0;if(!b){a=k+16|0;b=c[a>>2]|0;if(!b){d=0;break}}while(1){d=b+20|0;e=c[d>>2]|0;if(e|0){b=e;a=d;continue}d=b+16|0;e=c[d>>2]|0;if(!e)break;else {b=e;a=d;}}c[a>>2]=0;d=b;}else {d=c[k+8>>2]|0;c[d+12>>2]=b;c[b+8>>2]=d;d=b;}while(0);do if(f|0){b=c[k+28>>2]|0;a=3316+(b<<2)|0;if((k|0)==(c[a>>2]|0)){c[a>>2]=d;if(!d){c[754]=j&~(1<<b);break}}else {c[f+16+(((c[f+16>>2]|0)!=(k|0)&1)<<2)>>2]=d;if(!d)break}c[d+24>>2]=f;b=c[k+16>>2]|0;if(b|0){c[d+16>>2]=b;c[b+24>>2]=d;}b=c[k+20>>2]|0;if(b|0){c[d+20>>2]=b;c[b+24>>2]=d;}}while(0);if(h>>>0<16){w=h+m|0;c[k+4>>2]=w|3;w=k+w+4|0;c[w>>2]=c[w>>2]|1;}else {c[k+4>>2]=m|3;c[i+4>>2]=h|1;c[i+h>>2]=h;if(n|0){e=c[758]|0;b=n>>>3;d=3052+(b<<1<<2)|0;b=1<<b;if(!(o&b)){c[753]=o|b;b=d;a=d+8|0;}else {a=d+8|0;b=c[a>>2]|0;}c[a>>2]=e;c[b+12>>2]=e;c[e+8>>2]=b;c[e+12>>2]=d;}c[755]=h;c[758]=i;}w=k+8|0;l=x;return w|0}else n=m;}else n=m;}else n=m;}else if(a>>>0<=4294967231){a=a+11|0;m=a&-8;k=c[754]|0;if(k){e=0-m|0;a=a>>>8;if(a)if(m>>>0>16777215)j=31;else {o=(a+1048320|0)>>>16&8;v=a<<o;n=(v+520192|0)>>>16&4;v=v<<n;j=(v+245760|0)>>>16&2;j=14-(n|o|j)+(v<<j>>>15)|0;j=m>>>(j+7|0)&1|j<<1;}else j=0;d=c[3316+(j<<2)>>2]|0;a:do if(!d){d=0;a=0;v=57;}else {a=0;i=d;h=m<<((j|0)==31?0:25-(j>>>1)|0);d=0;while(1){f=(c[i+4>>2]&-8)-m|0;if(f>>>0<e>>>0)if(!f){e=0;d=i;a=i;v=61;break a}else {a=i;e=f;}f=c[i+20>>2]|0;i=c[i+16+(h>>>31<<2)>>2]|0;d=(f|0)==0|(f|0)==(i|0)?d:f;f=(i|0)==0;if(f){v=57;break}else h=h<<((f^1)&1);}}while(0);if((v|0)==57){if((d|0)==0&(a|0)==0){a=2<<j;a=k&(a|0-a);if(!a){n=m;break}o=(a&0-a)+-1|0;i=o>>>12&16;o=o>>>i;h=o>>>5&8;o=o>>>h;j=o>>>2&4;o=o>>>j;n=o>>>1&2;o=o>>>n;d=o>>>1&1;a=0;d=c[3316+((h|i|j|n|d)+(o>>>d)<<2)>>2]|0;}if(!d){i=a;h=e;}else v=61;}if((v|0)==61)while(1){v=0;n=(c[d+4>>2]&-8)-m|0;o=n>>>0<e>>>0;e=o?n:e;a=o?d:a;d=c[d+16+(((c[d+16>>2]|0)==0&1)<<2)>>2]|0;if(!d){i=a;h=e;break}else v=61;}if((i|0)!=0?h>>>0<((c[755]|0)-m|0)>>>0:0){g=i+m|0;if(g>>>0<=i>>>0){w=0;l=x;return w|0}f=c[i+24>>2]|0;b=c[i+12>>2]|0;do if((b|0)==(i|0)){a=i+20|0;b=c[a>>2]|0;if(!b){a=i+16|0;b=c[a>>2]|0;if(!b){b=0;break}}while(1){d=b+20|0;e=c[d>>2]|0;if(e|0){b=e;a=d;continue}d=b+16|0;e=c[d>>2]|0;if(!e)break;else {b=e;a=d;}}c[a>>2]=0;}else {w=c[i+8>>2]|0;c[w+12>>2]=b;c[b+8>>2]=w;}while(0);do if(f){a=c[i+28>>2]|0;d=3316+(a<<2)|0;if((i|0)==(c[d>>2]|0)){c[d>>2]=b;if(!b){e=k&~(1<<a);c[754]=e;break}}else {c[f+16+(((c[f+16>>2]|0)!=(i|0)&1)<<2)>>2]=b;if(!b){e=k;break}}c[b+24>>2]=f;a=c[i+16>>2]|0;if(a|0){c[b+16>>2]=a;c[a+24>>2]=b;}a=c[i+20>>2]|0;if(a){c[b+20>>2]=a;c[a+24>>2]=b;e=k;}else e=k;}else e=k;while(0);do if(h>>>0>=16){c[i+4>>2]=m|3;c[g+4>>2]=h|1;c[g+h>>2]=h;b=h>>>3;if(h>>>0<256){d=3052+(b<<1<<2)|0;a=c[753]|0;b=1<<b;if(!(a&b)){c[753]=a|b;b=d;a=d+8|0;}else {a=d+8|0;b=c[a>>2]|0;}c[a>>2]=g;c[b+12>>2]=g;c[g+8>>2]=b;c[g+12>>2]=d;break}b=h>>>8;if(b)if(h>>>0>16777215)b=31;else {v=(b+1048320|0)>>>16&8;w=b<<v;u=(w+520192|0)>>>16&4;w=w<<u;b=(w+245760|0)>>>16&2;b=14-(u|v|b)+(w<<b>>>15)|0;b=h>>>(b+7|0)&1|b<<1;}else b=0;d=3316+(b<<2)|0;c[g+28>>2]=b;a=g+16|0;c[a+4>>2]=0;c[a>>2]=0;a=1<<b;if(!(e&a)){c[754]=e|a;c[d>>2]=g;c[g+24>>2]=d;c[g+12>>2]=g;c[g+8>>2]=g;break}a=h<<((b|0)==31?0:25-(b>>>1)|0);d=c[d>>2]|0;while(1){if((c[d+4>>2]&-8|0)==(h|0)){v=97;break}e=d+16+(a>>>31<<2)|0;b=c[e>>2]|0;if(!b){v=96;break}else {a=a<<1;d=b;}}if((v|0)==96){c[e>>2]=g;c[g+24>>2]=d;c[g+12>>2]=g;c[g+8>>2]=g;break}else if((v|0)==97){v=d+8|0;w=c[v>>2]|0;c[w+12>>2]=g;c[v>>2]=g;c[g+8>>2]=w;c[g+12>>2]=d;c[g+24>>2]=0;break}}else {w=h+m|0;c[i+4>>2]=w|3;w=i+w+4|0;c[w>>2]=c[w>>2]|1;}while(0);w=i+8|0;l=x;return w|0}else n=m;}else n=m;}else n=-1;while(0);d=c[755]|0;if(d>>>0>=n>>>0){b=d-n|0;a=c[758]|0;if(b>>>0>15){w=a+n|0;c[758]=w;c[755]=b;c[w+4>>2]=b|1;c[a+d>>2]=b;c[a+4>>2]=n|3;}else {c[755]=0;c[758]=0;c[a+4>>2]=d|3;w=a+d+4|0;c[w>>2]=c[w>>2]|1;}w=a+8|0;l=x;return w|0}i=c[756]|0;if(i>>>0>n>>>0){u=i-n|0;c[756]=u;w=c[759]|0;v=w+n|0;c[759]=v;c[v+4>>2]=u|1;c[w+4>>2]=n|3;w=w+8|0;l=x;return w|0}if(!(c[871]|0)){c[873]=4096;c[872]=4096;c[874]=-1;c[875]=-1;c[876]=0;c[864]=0;c[871]=p&-16^1431655768;a=4096;}else a=c[873]|0;j=n+48|0;k=n+47|0;h=a+k|0;f=0-a|0;m=h&f;if(m>>>0<=n>>>0){w=0;l=x;return w|0}a=c[863]|0;if(a|0?(o=c[861]|0,p=o+m|0,p>>>0<=o>>>0|p>>>0>a>>>0):0){w=0;l=x;return w|0}b:do if(!(c[864]&4)){d=c[759]|0;c:do if(d){e=3460;while(1){a=c[e>>2]|0;if(a>>>0<=d>>>0?(s=e+4|0,(a+(c[s>>2]|0)|0)>>>0>d>>>0):0)break;a=c[e+8>>2]|0;if(!a){v=118;break c}else e=a;}b=h-i&f;if(b>>>0<2147483647){a=Db(b|0)|0;if((a|0)==((c[e>>2]|0)+(c[s>>2]|0)|0)){if((a|0)!=(-1|0)){h=b;g=a;v=135;break b}}else {e=a;v=126;}}else b=0;}else v=118;while(0);do if((v|0)==118){d=Db(0)|0;if((d|0)!=(-1|0)?(b=d,q=c[872]|0,r=q+-1|0,b=((r&b|0)==0?0:(r+b&0-q)-b|0)+m|0,q=c[861]|0,r=b+q|0,b>>>0>n>>>0&b>>>0<2147483647):0){s=c[863]|0;if(s|0?r>>>0<=q>>>0|r>>>0>s>>>0:0){b=0;break}a=Db(b|0)|0;if((a|0)==(d|0)){h=b;g=d;v=135;break b}else {e=a;v=126;}}else b=0;}while(0);do if((v|0)==126){d=0-b|0;if(!(j>>>0>b>>>0&(b>>>0<2147483647&(e|0)!=(-1|0))))if((e|0)==(-1|0)){b=0;break}else {h=b;g=e;v=135;break b}a=c[873]|0;a=k-b+a&0-a;if(a>>>0>=2147483647){h=b;g=e;v=135;break b}if((Db(a|0)|0)==(-1|0)){Db(d|0)|0;b=0;break}else {h=a+b|0;g=e;v=135;break b}}while(0);c[864]=c[864]|4;v=133;}else {b=0;v=133;}while(0);if(((v|0)==133?m>>>0<2147483647:0)?(g=Db(m|0)|0,s=Db(0)|0,t=s-g|0,u=t>>>0>(n+40|0)>>>0,!((g|0)==(-1|0)|u^1|g>>>0<s>>>0&((g|0)!=(-1|0)&(s|0)!=(-1|0))^1)):0){h=u?t:b;v=135;}if((v|0)==135){b=(c[861]|0)+h|0;c[861]=b;if(b>>>0>(c[862]|0)>>>0)c[862]=b;j=c[759]|0;do if(j){b=3460;while(1){a=c[b>>2]|0;d=b+4|0;e=c[d>>2]|0;if((g|0)==(a+e|0)){v=143;break}f=c[b+8>>2]|0;if(!f)break;else b=f;}if(((v|0)==143?(c[b+12>>2]&8|0)==0:0)?g>>>0>j>>>0&a>>>0<=j>>>0:0){c[d>>2]=e+h;w=(c[756]|0)+h|0;u=j+8|0;u=(u&7|0)==0?0:0-u&7;v=j+u|0;u=w-u|0;c[759]=v;c[756]=u;c[v+4>>2]=u|1;c[j+w+4>>2]=40;c[760]=c[875];break}if(g>>>0<(c[757]|0)>>>0)c[757]=g;a=g+h|0;b=3460;while(1){if((c[b>>2]|0)==(a|0)){v=151;break}b=c[b+8>>2]|0;if(!b){a=3460;break}}if((v|0)==151)if(!(c[b+12>>2]&8)){c[b>>2]=g;m=b+4|0;c[m>>2]=(c[m>>2]|0)+h;m=g+8|0;m=g+((m&7|0)==0?0:0-m&7)|0;b=a+8|0;b=a+((b&7|0)==0?0:0-b&7)|0;k=m+n|0;i=b-m-n|0;c[m+4>>2]=n|3;do if((j|0)!=(b|0)){if((c[758]|0)==(b|0)){w=(c[755]|0)+i|0;c[755]=w;c[758]=k;c[k+4>>2]=w|1;c[k+w>>2]=w;break}a=c[b+4>>2]|0;if((a&3|0)==1){h=a&-8;e=a>>>3;d:do if(a>>>0<256){a=c[b+8>>2]|0;d=c[b+12>>2]|0;if((d|0)==(a|0)){c[753]=c[753]&~(1<<e);break}else {c[a+12>>2]=d;c[d+8>>2]=a;break}}else {g=c[b+24>>2]|0;a=c[b+12>>2]|0;do if((a|0)==(b|0)){e=b+16|0;d=e+4|0;a=c[d>>2]|0;if(!a){a=c[e>>2]|0;if(!a){a=0;break}else d=e;}while(1){e=a+20|0;f=c[e>>2]|0;if(f|0){a=f;d=e;continue}e=a+16|0;f=c[e>>2]|0;if(!f)break;else {a=f;d=e;}}c[d>>2]=0;}else {w=c[b+8>>2]|0;c[w+12>>2]=a;c[a+8>>2]=w;}while(0);if(!g)break;d=c[b+28>>2]|0;e=3316+(d<<2)|0;do if((c[e>>2]|0)!=(b|0)){c[g+16+(((c[g+16>>2]|0)!=(b|0)&1)<<2)>>2]=a;if(!a)break d}else {c[e>>2]=a;if(a|0)break;c[754]=c[754]&~(1<<d);break d}while(0);c[a+24>>2]=g;d=b+16|0;e=c[d>>2]|0;if(e|0){c[a+16>>2]=e;c[e+24>>2]=a;}d=c[d+4>>2]|0;if(!d)break;c[a+20>>2]=d;c[d+24>>2]=a;}while(0);b=b+h|0;f=h+i|0;}else f=i;b=b+4|0;c[b>>2]=c[b>>2]&-2;c[k+4>>2]=f|1;c[k+f>>2]=f;b=f>>>3;if(f>>>0<256){d=3052+(b<<1<<2)|0;a=c[753]|0;b=1<<b;if(!(a&b)){c[753]=a|b;b=d;a=d+8|0;}else {a=d+8|0;b=c[a>>2]|0;}c[a>>2]=k;c[b+12>>2]=k;c[k+8>>2]=b;c[k+12>>2]=d;break}b=f>>>8;do if(!b)b=0;else {if(f>>>0>16777215){b=31;break}v=(b+1048320|0)>>>16&8;w=b<<v;u=(w+520192|0)>>>16&4;w=w<<u;b=(w+245760|0)>>>16&2;b=14-(u|v|b)+(w<<b>>>15)|0;b=f>>>(b+7|0)&1|b<<1;}while(0);e=3316+(b<<2)|0;c[k+28>>2]=b;a=k+16|0;c[a+4>>2]=0;c[a>>2]=0;a=c[754]|0;d=1<<b;if(!(a&d)){c[754]=a|d;c[e>>2]=k;c[k+24>>2]=e;c[k+12>>2]=k;c[k+8>>2]=k;break}a=f<<((b|0)==31?0:25-(b>>>1)|0);d=c[e>>2]|0;while(1){if((c[d+4>>2]&-8|0)==(f|0)){v=192;break}e=d+16+(a>>>31<<2)|0;b=c[e>>2]|0;if(!b){v=191;break}else {a=a<<1;d=b;}}if((v|0)==191){c[e>>2]=k;c[k+24>>2]=d;c[k+12>>2]=k;c[k+8>>2]=k;break}else if((v|0)==192){v=d+8|0;w=c[v>>2]|0;c[w+12>>2]=k;c[v>>2]=k;c[k+8>>2]=w;c[k+12>>2]=d;c[k+24>>2]=0;break}}else {w=(c[756]|0)+i|0;c[756]=w;c[759]=k;c[k+4>>2]=w|1;}while(0);w=m+8|0;l=x;return w|0}else a=3460;while(1){b=c[a>>2]|0;if(b>>>0<=j>>>0?(w=b+(c[a+4>>2]|0)|0,w>>>0>j>>>0):0)break;a=c[a+8>>2]|0;}f=w+-47|0;a=f+8|0;a=f+((a&7|0)==0?0:0-a&7)|0;f=j+16|0;a=a>>>0<f>>>0?j:a;b=a+8|0;d=h+-40|0;u=g+8|0;u=(u&7|0)==0?0:0-u&7;v=g+u|0;u=d-u|0;c[759]=v;c[756]=u;c[v+4>>2]=u|1;c[g+d+4>>2]=40;c[760]=c[875];d=a+4|0;c[d>>2]=27;c[b>>2]=c[865];c[b+4>>2]=c[866];c[b+8>>2]=c[867];c[b+12>>2]=c[868];c[865]=g;c[866]=h;c[868]=0;c[867]=b;b=a+24|0;do{v=b;b=b+4|0;c[b>>2]=7;}while((v+8|0)>>>0<w>>>0);if((a|0)!=(j|0)){g=a-j|0;c[d>>2]=c[d>>2]&-2;c[j+4>>2]=g|1;c[a>>2]=g;b=g>>>3;if(g>>>0<256){d=3052+(b<<1<<2)|0;a=c[753]|0;b=1<<b;if(!(a&b)){c[753]=a|b;b=d;a=d+8|0;}else {a=d+8|0;b=c[a>>2]|0;}c[a>>2]=j;c[b+12>>2]=j;c[j+8>>2]=b;c[j+12>>2]=d;break}b=g>>>8;if(b)if(g>>>0>16777215)d=31;else {v=(b+1048320|0)>>>16&8;w=b<<v;u=(w+520192|0)>>>16&4;w=w<<u;d=(w+245760|0)>>>16&2;d=14-(u|v|d)+(w<<d>>>15)|0;d=g>>>(d+7|0)&1|d<<1;}else d=0;e=3316+(d<<2)|0;c[j+28>>2]=d;c[j+20>>2]=0;c[f>>2]=0;b=c[754]|0;a=1<<d;if(!(b&a)){c[754]=b|a;c[e>>2]=j;c[j+24>>2]=e;c[j+12>>2]=j;c[j+8>>2]=j;break}a=g<<((d|0)==31?0:25-(d>>>1)|0);d=c[e>>2]|0;while(1){if((c[d+4>>2]&-8|0)==(g|0)){v=213;break}e=d+16+(a>>>31<<2)|0;b=c[e>>2]|0;if(!b){v=212;break}else {a=a<<1;d=b;}}if((v|0)==212){c[e>>2]=j;c[j+24>>2]=d;c[j+12>>2]=j;c[j+8>>2]=j;break}else if((v|0)==213){v=d+8|0;w=c[v>>2]|0;c[w+12>>2]=j;c[v>>2]=j;c[j+8>>2]=w;c[j+12>>2]=d;c[j+24>>2]=0;break}}}else {w=c[757]|0;if((w|0)==0|g>>>0<w>>>0)c[757]=g;c[865]=g;c[866]=h;c[868]=0;c[762]=c[871];c[761]=-1;c[766]=3052;c[765]=3052;c[768]=3060;c[767]=3060;c[770]=3068;c[769]=3068;c[772]=3076;c[771]=3076;c[774]=3084;c[773]=3084;c[776]=3092;c[775]=3092;c[778]=3100;c[777]=3100;c[780]=3108;c[779]=3108;c[782]=3116;c[781]=3116;c[784]=3124;c[783]=3124;c[786]=3132;c[785]=3132;c[788]=3140;c[787]=3140;c[790]=3148;c[789]=3148;c[792]=3156;c[791]=3156;c[794]=3164;c[793]=3164;c[796]=3172;c[795]=3172;c[798]=3180;c[797]=3180;c[800]=3188;c[799]=3188;c[802]=3196;c[801]=3196;c[804]=3204;c[803]=3204;c[806]=3212;c[805]=3212;c[808]=3220;c[807]=3220;c[810]=3228;c[809]=3228;c[812]=3236;c[811]=3236;c[814]=3244;c[813]=3244;c[816]=3252;c[815]=3252;c[818]=3260;c[817]=3260;c[820]=3268;c[819]=3268;c[822]=3276;c[821]=3276;c[824]=3284;c[823]=3284;c[826]=3292;c[825]=3292;c[828]=3300;c[827]=3300;w=h+-40|0;u=g+8|0;u=(u&7|0)==0?0:0-u&7;v=g+u|0;u=w-u|0;c[759]=v;c[756]=u;c[v+4>>2]=u|1;c[g+w+4>>2]=40;c[760]=c[875];}while(0);b=c[756]|0;if(b>>>0>n>>>0){u=b-n|0;c[756]=u;w=c[759]|0;v=w+n|0;c[759]=v;c[v+4>>2]=u|1;c[w+4>>2]=n|3;w=w+8|0;l=x;return w|0}}c[(Ka()|0)>>2]=12;w=0;l=x;return w|0}function Fa(a){a=a|0;var b=0,d=0,e=0,f=0,g=0,h=0,i=0,j=0;if(!a)return;d=a+-8|0;f=c[757]|0;a=c[a+-4>>2]|0;b=a&-8;j=d+b|0;do if(!(a&1)){e=c[d>>2]|0;if(!(a&3))return;h=d+(0-e)|0;g=e+b|0;if(h>>>0<f>>>0)return;if((c[758]|0)==(h|0)){a=j+4|0;b=c[a>>2]|0;if((b&3|0)!=3){i=h;b=g;break}c[755]=g;c[a>>2]=b&-2;c[h+4>>2]=g|1;c[h+g>>2]=g;return}d=e>>>3;if(e>>>0<256){a=c[h+8>>2]|0;b=c[h+12>>2]|0;if((b|0)==(a|0)){c[753]=c[753]&~(1<<d);i=h;b=g;break}else {c[a+12>>2]=b;c[b+8>>2]=a;i=h;b=g;break}}f=c[h+24>>2]|0;a=c[h+12>>2]|0;do if((a|0)==(h|0)){d=h+16|0;b=d+4|0;a=c[b>>2]|0;if(!a){a=c[d>>2]|0;if(!a){a=0;break}else b=d;}while(1){d=a+20|0;e=c[d>>2]|0;if(e|0){a=e;b=d;continue}d=a+16|0;e=c[d>>2]|0;if(!e)break;else {a=e;b=d;}}c[b>>2]=0;}else {i=c[h+8>>2]|0;c[i+12>>2]=a;c[a+8>>2]=i;}while(0);if(f){b=c[h+28>>2]|0;d=3316+(b<<2)|0;if((c[d>>2]|0)==(h|0)){c[d>>2]=a;if(!a){c[754]=c[754]&~(1<<b);i=h;b=g;break}}else {c[f+16+(((c[f+16>>2]|0)!=(h|0)&1)<<2)>>2]=a;if(!a){i=h;b=g;break}}c[a+24>>2]=f;b=h+16|0;d=c[b>>2]|0;if(d|0){c[a+16>>2]=d;c[d+24>>2]=a;}b=c[b+4>>2]|0;if(b){c[a+20>>2]=b;c[b+24>>2]=a;i=h;b=g;}else {i=h;b=g;}}else {i=h;b=g;}}else {i=d;h=d;}while(0);if(h>>>0>=j>>>0)return;a=j+4|0;e=c[a>>2]|0;if(!(e&1))return;if(!(e&2)){if((c[759]|0)==(j|0)){j=(c[756]|0)+b|0;c[756]=j;c[759]=i;c[i+4>>2]=j|1;if((i|0)!=(c[758]|0))return;c[758]=0;c[755]=0;return}if((c[758]|0)==(j|0)){j=(c[755]|0)+b|0;c[755]=j;c[758]=h;c[i+4>>2]=j|1;c[h+j>>2]=j;return}f=(e&-8)+b|0;d=e>>>3;do if(e>>>0<256){b=c[j+8>>2]|0;a=c[j+12>>2]|0;if((a|0)==(b|0)){c[753]=c[753]&~(1<<d);break}else {c[b+12>>2]=a;c[a+8>>2]=b;break}}else {g=c[j+24>>2]|0;a=c[j+12>>2]|0;do if((a|0)==(j|0)){d=j+16|0;b=d+4|0;a=c[b>>2]|0;if(!a){a=c[d>>2]|0;if(!a){d=0;break}else b=d;}while(1){d=a+20|0;e=c[d>>2]|0;if(e|0){a=e;b=d;continue}d=a+16|0;e=c[d>>2]|0;if(!e)break;else {a=e;b=d;}}c[b>>2]=0;d=a;}else {d=c[j+8>>2]|0;c[d+12>>2]=a;c[a+8>>2]=d;d=a;}while(0);if(g|0){a=c[j+28>>2]|0;b=3316+(a<<2)|0;if((c[b>>2]|0)==(j|0)){c[b>>2]=d;if(!d){c[754]=c[754]&~(1<<a);break}}else {c[g+16+(((c[g+16>>2]|0)!=(j|0)&1)<<2)>>2]=d;if(!d)break}c[d+24>>2]=g;a=j+16|0;b=c[a>>2]|0;if(b|0){c[d+16>>2]=b;c[b+24>>2]=d;}a=c[a+4>>2]|0;if(a|0){c[d+20>>2]=a;c[a+24>>2]=d;}}}while(0);c[i+4>>2]=f|1;c[h+f>>2]=f;if((i|0)==(c[758]|0)){c[755]=f;return}}else {c[a>>2]=e&-2;c[i+4>>2]=b|1;c[h+b>>2]=b;f=b;}a=f>>>3;if(f>>>0<256){d=3052+(a<<1<<2)|0;b=c[753]|0;a=1<<a;if(!(b&a)){c[753]=b|a;a=d;b=d+8|0;}else {b=d+8|0;a=c[b>>2]|0;}c[b>>2]=i;c[a+12>>2]=i;c[i+8>>2]=a;c[i+12>>2]=d;return}a=f>>>8;if(a)if(f>>>0>16777215)a=31;else {h=(a+1048320|0)>>>16&8;j=a<<h;g=(j+520192|0)>>>16&4;j=j<<g;a=(j+245760|0)>>>16&2;a=14-(g|h|a)+(j<<a>>>15)|0;a=f>>>(a+7|0)&1|a<<1;}else a=0;e=3316+(a<<2)|0;c[i+28>>2]=a;c[i+20>>2]=0;c[i+16>>2]=0;b=c[754]|0;d=1<<a;do if(b&d){b=f<<((a|0)==31?0:25-(a>>>1)|0);d=c[e>>2]|0;while(1){if((c[d+4>>2]&-8|0)==(f|0)){a=73;break}e=d+16+(b>>>31<<2)|0;a=c[e>>2]|0;if(!a){a=72;break}else {b=b<<1;d=a;}}if((a|0)==72){c[e>>2]=i;c[i+24>>2]=d;c[i+12>>2]=i;c[i+8>>2]=i;break}else if((a|0)==73){h=d+8|0;j=c[h>>2]|0;c[j+12>>2]=i;c[h>>2]=i;c[i+8>>2]=j;c[i+12>>2]=d;c[i+24>>2]=0;break}}else {c[754]=b|d;c[e>>2]=i;c[i+24>>2]=e;c[i+12>>2]=i;c[i+8>>2]=i;}while(0);j=(c[761]|0)+-1|0;c[761]=j;if(!j)a=3468;else return;while(1){a=c[a>>2]|0;if(!a)break;else a=a+8|0;}c[761]=-1;return}function Ga(a){a=a|0;var b=0,d=0;b=l;l=l+16|0;d=b;c[d>>2]=La(c[a+60>>2]|0)|0;a=Ja(ba(6,d|0)|0)|0;l=b;return a|0}function Ha(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0,h=0,i=0,j=0,k=0,m=0,n=0,o=0,p=0;n=l;l=l+48|0;k=n+16|0;g=n;f=n+32|0;i=a+28|0;e=c[i>>2]|0;c[f>>2]=e;j=a+20|0;e=(c[j>>2]|0)-e|0;c[f+4>>2]=e;c[f+8>>2]=b;c[f+12>>2]=d;e=e+d|0;h=a+60|0;c[g>>2]=c[h>>2];c[g+4>>2]=f;c[g+8>>2]=2;g=Ja($(146,g|0)|0)|0;a:do if((e|0)!=(g|0)){b=2;while(1){if((g|0)<0)break;e=e-g|0;p=c[f+4>>2]|0;o=g>>>0>p>>>0;f=o?f+8|0:f;b=b+(o<<31>>31)|0;p=g-(o?p:0)|0;c[f>>2]=(c[f>>2]|0)+p;o=f+4|0;c[o>>2]=(c[o>>2]|0)-p;c[k>>2]=c[h>>2];c[k+4>>2]=f;c[k+8>>2]=b;g=Ja($(146,k|0)|0)|0;if((e|0)==(g|0)){m=3;break a}}c[a+16>>2]=0;c[i>>2]=0;c[j>>2]=0;c[a>>2]=c[a>>2]|32;if((b|0)==2)d=0;else d=d-(c[f+4>>2]|0)|0;}else m=3;while(0);if((m|0)==3){p=c[a+44>>2]|0;c[a+16>>2]=p+(c[a+48>>2]|0);c[i>>2]=p;c[j>>2]=p;}l=n;return d|0}function Ia(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0;f=l;l=l+32|0;g=f;e=f+20|0;c[g>>2]=c[a+60>>2];c[g+4>>2]=0;c[g+8>>2]=b;c[g+12>>2]=e;c[g+16>>2]=d;if((Ja(_(140,g|0)|0)|0)<0){c[e>>2]=-1;a=-1;}else a=c[e>>2]|0;l=f;return a|0}function Ja(a){a=a|0;if(a>>>0>4294963200){c[(Ka()|0)>>2]=0-a;a=-1;}return a|0}function Ka(){return 3572}function La(a){a=a|0;return a|0}function Ma(b,d,e){b=b|0;d=d|0;e=e|0;var f=0,g=0;g=l;l=l+32|0;f=g;c[b+36>>2]=3;if((c[b>>2]&64|0)==0?(c[f>>2]=c[b+60>>2],c[f+4>>2]=21523,c[f+8>>2]=g+16,aa(54,f|0)|0):0)a[b+75>>0]=-1;f=Ha(b,d,e)|0;l=g;return f|0}function Na(b,c){b=b|0;c=c|0;var d=0,e=0;d=a[b>>0]|0;e=a[c>>0]|0;if(d<<24>>24==0?1:d<<24>>24!=e<<24>>24)b=e;else {do{b=b+1|0;c=c+1|0;d=a[b>>0]|0;e=a[c>>0]|0;}while(!(d<<24>>24==0?1:d<<24>>24!=e<<24>>24));b=e;}return (d&255)-(b&255)|0}function Oa(a){a=a|0;return (a+-48|0)>>>0<10|0}function Pa(b,d,e){b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,i=0,j=0,k=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0;s=l;l=l+224|0;n=s+120|0;o=s+80|0;q=s;r=s+136|0;f=o;g=f+40|0;do{c[f>>2]=0;f=f+4|0;}while((f|0)<(g|0));c[n>>2]=c[e>>2];if((Qa(0,d,n,q,o)|0)<0)e=-1;else {if((c[b+76>>2]|0)>-1)p=Ra(b)|0;else p=0;e=c[b>>2]|0;m=e&32;if((a[b+74>>0]|0)<1)c[b>>2]=e&-33;f=b+48|0;if(!(c[f>>2]|0)){g=b+44|0;h=c[g>>2]|0;c[g>>2]=r;i=b+28|0;c[i>>2]=r;j=b+20|0;c[j>>2]=r;c[f>>2]=80;k=b+16|0;c[k>>2]=r+80;e=Qa(b,d,n,q,o)|0;if(h){ga[c[b+36>>2]&3](b,0,0)|0;e=(c[j>>2]|0)==0?-1:e;c[g>>2]=h;c[f>>2]=0;c[k>>2]=0;c[i>>2]=0;c[j>>2]=0;}}else e=Qa(b,d,n,q,o)|0;f=c[b>>2]|0;c[b>>2]=f|m;if(p|0)Sa(b);e=(f&32|0)==0?e:-1;}l=s;return e|0}function Qa(d,e,f,g,i){d=d|0;e=e|0;f=f|0;g=g|0;i=i|0;var j=0,k=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,A=0,B=0,C=0,D=0,E=0,F=0,G=0,H=0,I=0;I=l;l=l+64|0;D=I+16|0;E=I;A=I+24|0;G=I+8|0;H=I+20|0;c[D>>2]=e;w=(d|0)!=0;x=A+40|0;y=x;A=A+39|0;B=G+4|0;j=0;e=0;m=0;a:while(1){do if((e|0)>-1)if((j|0)>(2147483647-e|0)){c[(Ka()|0)>>2]=75;e=-1;break}else {e=j+e|0;break}while(0);r=c[D>>2]|0;j=a[r>>0]|0;if(!(j<<24>>24)){v=88;break}else k=r;b:while(1){switch(j<<24>>24){case 37:{j=k;v=9;break b}case 0:{j=k;break b}default:{}}u=k+1|0;c[D>>2]=u;j=a[u>>0]|0;k=u;}c:do if((v|0)==9)while(1){v=0;if((a[k+1>>0]|0)!=37)break c;j=j+1|0;k=k+2|0;c[D>>2]=k;if((a[k>>0]|0)!=37)break;else v=9;}while(0);j=j-r|0;if(w)Ta(d,r,j);if(j|0)continue;u=(Oa(a[(c[D>>2]|0)+1>>0]|0)|0)==0;k=c[D>>2]|0;if(!u?(a[k+2>>0]|0)==36:0){s=(a[k+1>>0]|0)+-48|0;n=1;j=3;}else {s=-1;n=m;j=1;}j=k+j|0;c[D>>2]=j;k=a[j>>0]|0;u=(k<<24>>24)+-32|0;if(u>>>0>31|(1<<u&75913|0)==0)m=0;else {m=0;do{m=1<<(k<<24>>24)+-32|m;j=j+1|0;c[D>>2]=j;k=a[j>>0]|0;u=(k<<24>>24)+-32|0;}while(!(u>>>0>31|(1<<u&75913|0)==0))}if(k<<24>>24==42){if((Oa(a[j+1>>0]|0)|0)!=0?(F=c[D>>2]|0,(a[F+2>>0]|0)==36):0){j=F+1|0;c[i+((a[j>>0]|0)+-48<<2)>>2]=10;j=c[g+((a[j>>0]|0)+-48<<3)>>2]|0;k=1;n=F+3|0;}else {if(n|0){e=-1;break}if(w){u=(c[f>>2]|0)+(4-1)&~(4-1);j=c[u>>2]|0;c[f>>2]=u+4;}else j=0;k=0;n=(c[D>>2]|0)+1|0;}c[D>>2]=n;t=(j|0)<0;u=t?0-j|0:j;m=t?m|8192:m;t=k;j=n;}else {j=Ua(D)|0;if((j|0)<0){e=-1;break}u=j;t=n;j=c[D>>2]|0;}do if((a[j>>0]|0)==46){if((a[j+1>>0]|0)!=42){c[D>>2]=j+1;p=Ua(D)|0;j=c[D>>2]|0;break}if(Oa(a[j+2>>0]|0)|0?(C=c[D>>2]|0,(a[C+3>>0]|0)==36):0){p=C+2|0;c[i+((a[p>>0]|0)+-48<<2)>>2]=10;p=c[g+((a[p>>0]|0)+-48<<3)>>2]|0;j=C+4|0;c[D>>2]=j;break}if(t|0){e=-1;break a}if(w){q=(c[f>>2]|0)+(4-1)&~(4-1);j=c[q>>2]|0;c[f>>2]=q+4;}else j=0;q=(c[D>>2]|0)+2|0;c[D>>2]=q;p=j;j=q;}else p=-1;while(0);q=0;while(1){if(((a[j>>0]|0)+-65|0)>>>0>57){e=-1;break a}k=j;j=j+1|0;c[D>>2]=j;k=a[(a[k>>0]|0)+-65+(585+(q*58|0))>>0]|0;n=k&255;if((n+-1|0)>>>0>=8)break;else q=n;}if(!(k<<24>>24)){e=-1;break}o=(s|0)>-1;do if(k<<24>>24==19)if(o){e=-1;break a}else v=50;else {if(o){c[i+(s<<2)>>2]=n;o=g+(s<<3)|0;s=c[o+4>>2]|0;v=E;c[v>>2]=c[o>>2];c[v+4>>2]=s;v=50;break}if(!w){e=0;break a}Va(E,n,f);j=c[D>>2]|0;}while(0);if((v|0)==50){v=0;if(!w){j=0;m=t;continue}}k=a[j+-1>>0]|0;k=(q|0)!=0&(k&15|0)==3?k&-33:k;j=m&-65537;s=(m&8192|0)==0?m:j;d:do switch(k|0){case 110:switch((q&255)<<24>>24){case 0:{c[c[E>>2]>>2]=e;j=0;m=t;continue a}case 1:{c[c[E>>2]>>2]=e;j=0;m=t;continue a}case 2:{j=c[E>>2]|0;c[j>>2]=e;c[j+4>>2]=((e|0)<0)<<31>>31;j=0;m=t;continue a}case 3:{b[c[E>>2]>>1]=e;j=0;m=t;continue a}case 4:{a[c[E>>2]>>0]=e;j=0;m=t;continue a}case 6:{c[c[E>>2]>>2]=e;j=0;m=t;continue a}case 7:{j=c[E>>2]|0;c[j>>2]=e;c[j+4>>2]=((e|0)<0)<<31>>31;j=0;m=t;continue a}default:{j=0;m=t;continue a}}case 112:{k=120;j=p>>>0>8?p:8;m=s|8;v=62;break}case 88:case 120:{j=p;m=s;v=62;break}case 111:{k=E;j=c[k>>2]|0;k=c[k+4>>2]|0;o=Xa(j,k,x)|0;m=y-o|0;q=0;n=1049;p=(s&8|0)==0|(p|0)>(m|0)?p:m+1|0;m=s;v=68;break}case 105:case 100:{k=E;j=c[k>>2]|0;k=c[k+4>>2]|0;if((k|0)<0){j=tb(0,0,j|0,k|0)|0;k=z;m=E;c[m>>2]=j;c[m+4>>2]=k;m=1;n=1049;v=67;break d}else {m=(s&2049|0)!=0&1;n=(s&2048|0)==0?((s&1|0)==0?1049:1051):1050;v=67;break d}}case 117:{k=E;m=0;n=1049;j=c[k>>2]|0;k=c[k+4>>2]|0;v=67;break}case 99:{a[A>>0]=c[E>>2];r=A;q=0;n=1049;o=x;k=1;break}case 109:{k=Za(c[(Ka()|0)>>2]|0)|0;v=72;break}case 115:{k=c[E>>2]|0;k=k|0?k:1059;v=72;break}case 67:{c[G>>2]=c[E>>2];c[B>>2]=0;c[E>>2]=G;p=-1;m=G;v=76;break}case 83:{j=c[E>>2]|0;if(!p){$a(d,32,u,0,s);j=0;v=85;}else {m=j;v=76;}break}case 65:case 71:case 70:case 69:case 97:case 103:case 102:case 101:{j=bb(d,+h[E>>3],u,p,s,k)|0;m=t;continue a}default:{q=0;n=1049;o=x;k=p;j=s;}}while(0);e:do if((v|0)==62){s=E;r=c[s>>2]|0;s=c[s+4>>2]|0;o=Wa(r,s,x,k&32)|0;n=(m&8|0)==0|(r|0)==0&(s|0)==0;q=n?0:2;n=n?1049:1049+(k>>4)|0;p=j;j=r;k=s;v=68;}else if((v|0)==67){o=Ya(j,k,x)|0;q=m;m=s;v=68;}else if((v|0)==72){v=0;s=_a(k,0,p)|0;m=(s|0)==0;r=k;q=0;n=1049;o=m?k+p|0:s;k=m?p:s-k|0;}else if((v|0)==76){v=0;o=m;j=0;k=0;while(1){n=c[o>>2]|0;if(!n)break;k=ab(H,n)|0;if((k|0)<0|k>>>0>(p-j|0)>>>0)break;j=k+j|0;if(p>>>0>j>>>0)o=o+4|0;else break}if((k|0)<0){e=-1;break a}$a(d,32,u,j,s);if(!j){j=0;v=85;}else {n=0;while(1){k=c[m>>2]|0;if(!k){v=85;break e}k=ab(H,k)|0;n=k+n|0;if((n|0)>(j|0)){v=85;break e}Ta(d,H,k);if(n>>>0>=j>>>0){v=85;break}else m=m+4|0;}}}while(0);if((v|0)==68){v=0;k=(j|0)!=0|(k|0)!=0;j=(p|0)!=0|k;k=y-o+((k^1)&1)|0;r=j?o:x;o=x;k=j?((p|0)>(k|0)?p:k):p;j=(p|0)>-1?m&-65537:m;}else if((v|0)==85){v=0;$a(d,32,u,j,s^8192);j=(u|0)>(j|0)?u:j;m=t;continue}p=o-r|0;o=(k|0)<(p|0)?p:k;s=o+q|0;m=(u|0)<(s|0)?s:u;$a(d,32,m,s,j);Ta(d,n,q);$a(d,48,m,s,j^65536);$a(d,48,o,p,0);Ta(d,r,p);$a(d,32,m,s,j^8192);j=m;m=t;}f:do if((v|0)==88)if(!d)if(m){e=1;while(1){j=c[i+(e<<2)>>2]|0;if(!j)break;Va(g+(e<<3)|0,j,f);j=e+1|0;if((e|0)<9)e=j;else {e=j;break}}if((e|0)<10)while(1){if(c[i+(e<<2)>>2]|0){e=-1;break f}if((e|0)<9)e=e+1|0;else {e=1;break}}else e=1;}else e=0;while(0);l=I;return e|0}function Ra(a){a=a|0;return 0}function Sa(a){a=a|0;return}function Ta(a,b,d){a=a|0;b=b|0;d=d|0;if(!(c[a>>2]&32))ob(b,d,a)|0;return}function Ua(b){b=b|0;var d=0,e=0;if(!(Oa(a[c[b>>2]>>0]|0)|0))d=0;else {d=0;do{e=c[b>>2]|0;d=(d*10|0)+-48+(a[e>>0]|0)|0;e=e+1|0;c[b>>2]=e;}while((Oa(a[e>>0]|0)|0)!=0)}return d|0}function Va(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0.0;a:do if(b>>>0<=20)do switch(b|0){case 9:{e=(c[d>>2]|0)+(4-1)&~(4-1);b=c[e>>2]|0;c[d>>2]=e+4;c[a>>2]=b;break a}case 10:{e=(c[d>>2]|0)+(4-1)&~(4-1);b=c[e>>2]|0;c[d>>2]=e+4;e=a;c[e>>2]=b;c[e+4>>2]=((b|0)<0)<<31>>31;break a}case 11:{e=(c[d>>2]|0)+(4-1)&~(4-1);b=c[e>>2]|0;c[d>>2]=e+4;e=a;c[e>>2]=b;c[e+4>>2]=0;break a}case 12:{e=(c[d>>2]|0)+(8-1)&~(8-1);b=e;f=c[b>>2]|0;b=c[b+4>>2]|0;c[d>>2]=e+8;e=a;c[e>>2]=f;c[e+4>>2]=b;break a}case 13:{f=(c[d>>2]|0)+(4-1)&~(4-1);e=c[f>>2]|0;c[d>>2]=f+4;e=(e&65535)<<16>>16;f=a;c[f>>2]=e;c[f+4>>2]=((e|0)<0)<<31>>31;break a}case 14:{f=(c[d>>2]|0)+(4-1)&~(4-1);e=c[f>>2]|0;c[d>>2]=f+4;f=a;c[f>>2]=e&65535;c[f+4>>2]=0;break a}case 15:{f=(c[d>>2]|0)+(4-1)&~(4-1);e=c[f>>2]|0;c[d>>2]=f+4;e=(e&255)<<24>>24;f=a;c[f>>2]=e;c[f+4>>2]=((e|0)<0)<<31>>31;break a}case 16:{f=(c[d>>2]|0)+(4-1)&~(4-1);e=c[f>>2]|0;c[d>>2]=f+4;f=a;c[f>>2]=e&255;c[f+4>>2]=0;break a}case 17:{f=(c[d>>2]|0)+(8-1)&~(8-1);g=+h[f>>3];c[d>>2]=f+8;h[a>>3]=g;break a}case 18:{f=(c[d>>2]|0)+(8-1)&~(8-1);g=+h[f>>3];c[d>>2]=f+8;h[a>>3]=g;break a}default:break a}while(0);while(0);return}function Wa(b,c,e,f){b=b|0;c=c|0;e=e|0;f=f|0;if(!((b|0)==0&(c|0)==0))do{e=e+-1|0;a[e>>0]=d[1101+(b&15)>>0]|0|f;b=yb(b|0,c|0,4)|0;c=z;}while(!((b|0)==0&(c|0)==0));return e|0}function Xa(b,c,d){b=b|0;c=c|0;d=d|0;if(!((b|0)==0&(c|0)==0))do{d=d+-1|0;a[d>>0]=b&7|48;b=yb(b|0,c|0,3)|0;c=z;}while(!((b|0)==0&(c|0)==0));return d|0}function Ya(b,c,d){b=b|0;c=c|0;d=d|0;var e=0;if(c>>>0>0|(c|0)==0&b>>>0>4294967295){while(1){e=xb(b|0,c|0,10,0)|0;d=d+-1|0;a[d>>0]=e&255|48;e=b;b=wb(b|0,c|0,10,0)|0;if(!(c>>>0>9|(c|0)==9&e>>>0>4294967295))break;else c=z;}c=b;}else c=b;if(c)while(1){d=d+-1|0;a[d>>0]=(c>>>0)%10|0|48;if(c>>>0<10)break;else c=(c>>>0)/10|0;}return d|0}function Za(a){a=a|0;return jb(a,c[(ib()|0)+188>>2]|0)|0}function _a(b,d,e){b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,i=0;h=d&255;f=(e|0)!=0;a:do if(f&(b&3|0)!=0){g=d&255;while(1){if((a[b>>0]|0)==g<<24>>24){i=6;break a}b=b+1|0;e=e+-1|0;f=(e|0)!=0;if(!(f&(b&3|0)!=0)){i=5;break}}}else i=5;while(0);if((i|0)==5)if(f)i=6;else e=0;b:do if((i|0)==6){g=d&255;if((a[b>>0]|0)!=g<<24>>24){f=O(h,16843009)|0;c:do if(e>>>0>3)while(1){h=c[b>>2]^f;if((h&-2139062144^-2139062144)&h+-16843009|0)break;b=b+4|0;e=e+-4|0;if(e>>>0<=3){i=11;break c}}else i=11;while(0);if((i|0)==11)if(!e){e=0;break}while(1){if((a[b>>0]|0)==g<<24>>24)break b;b=b+1|0;e=e+-1|0;if(!e){e=0;break}}}}while(0);return (e|0?b:0)|0}function $a(a,b,c,d,e){a=a|0;b=b|0;c=c|0;d=d|0;e=e|0;var f=0,g=0;g=l;l=l+256|0;f=g;if((c|0)>(d|0)&(e&73728|0)==0){e=c-d|0;Cb(f|0,b<<24>>24|0,(e>>>0<256?e:256)|0)|0;if(e>>>0>255){b=c-d|0;do{Ta(a,f,256);e=e+-256|0;}while(e>>>0>255);e=b&255;}Ta(a,f,e);}l=g;return}function ab(a,b){a=a|0;b=b|0;if(!a)a=0;else a=fb(a,b,0)|0;return a|0}function bb(b,e,f,g,h,i){b=b|0;e=+e;f=f|0;g=g|0;h=h|0;i=i|0;var j=0,k=0,m=0,n=0,o=0,p=0,q=0,r=0.0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,A=0,B=0,C=0,D=0,E=0,F=0,G=0,H=0;H=l;l=l+560|0;m=H+8|0;u=H;G=H+524|0;F=G;n=H+512|0;c[u>>2]=0;E=n+12|0;cb(e)|0;if((z|0)<0){e=-e;C=1;B=1066;}else {C=(h&2049|0)!=0&1;B=(h&2048|0)==0?((h&1|0)==0?1067:1072):1069;}cb(e)|0;do if(0==0&(z&2146435072|0)==2146435072){G=(i&32|0)!=0;j=C+3|0;$a(b,32,f,j,h&-65537);Ta(b,B,C);Ta(b,e!=e|0.0!=0.0?(G?1093:1097):G?1085:1089,3);$a(b,32,f,j,h^8192);}else {r=+db(e,u)*2.0;j=r!=0.0;if(j)c[u>>2]=(c[u>>2]|0)+-1;w=i|32;if((w|0)==97){p=i&32;s=(p|0)==0?B:B+9|0;q=C|2;j=12-g|0;do if(!(g>>>0>11|(j|0)==0)){e=8.0;do{j=j+-1|0;e=e*16.0;}while((j|0)!=0);if((a[s>>0]|0)==45){e=-(e+(-r-e));break}else {e=r+e-e;break}}else e=r;while(0);k=c[u>>2]|0;j=(k|0)<0?0-k|0:k;j=Ya(j,((j|0)<0)<<31>>31,E)|0;if((j|0)==(E|0)){j=n+11|0;a[j>>0]=48;}a[j+-1>>0]=(k>>31&2)+43;o=j+-2|0;a[o>>0]=i+15;m=(g|0)<1;n=(h&8|0)==0;j=G;do{D=~~e;k=j+1|0;a[j>>0]=p|d[1101+D>>0];e=(e-+(D|0))*16.0;if((k-F|0)==1?!(n&(m&e==0.0)):0){a[k>>0]=46;j=j+2|0;}else j=k;}while(e!=0.0);if((g|0)!=0?(-2-F+j|0)<(g|0):0){k=j-F|0;j=g+2|0;}else {j=j-F|0;k=j;}E=E-o|0;F=E+q+j|0;$a(b,32,f,F,h);Ta(b,s,q);$a(b,48,f,F,h^65536);Ta(b,G,k);$a(b,48,j-k|0,0,0);Ta(b,o,E);$a(b,32,f,F,h^8192);j=F;break}k=(g|0)<0?6:g;if(j){j=(c[u>>2]|0)+-28|0;c[u>>2]=j;e=r*268435456.0;}else {e=r;j=c[u>>2]|0;}D=(j|0)<0?m:m+288|0;m=D;do{y=~~e>>>0;c[m>>2]=y;m=m+4|0;e=(e-+(y>>>0))*1.0e9;}while(e!=0.0);if((j|0)>0){n=D;p=m;while(1){o=(j|0)<29?j:29;j=p+-4|0;if(j>>>0>=n>>>0){m=0;do{x=zb(c[j>>2]|0,0,o|0)|0;x=sb(x|0,z|0,m|0,0)|0;y=z;v=xb(x|0,y|0,1e9,0)|0;c[j>>2]=v;m=wb(x|0,y|0,1e9,0)|0;j=j+-4|0;}while(j>>>0>=n>>>0);if(m){n=n+-4|0;c[n>>2]=m;}}m=p;while(1){if(m>>>0<=n>>>0)break;j=m+-4|0;if(!(c[j>>2]|0))m=j;else break}j=(c[u>>2]|0)-o|0;c[u>>2]=j;if((j|0)>0)p=m;else break}}else n=D;if((j|0)<0){g=((k+25|0)/9|0)+1|0;t=(w|0)==102;do{s=0-j|0;s=(s|0)<9?s:9;if(n>>>0<m>>>0){o=(1<<s)+-1|0;p=1e9>>>s;q=0;j=n;do{y=c[j>>2]|0;c[j>>2]=(y>>>s)+q;q=O(y&o,p)|0;j=j+4|0;}while(j>>>0<m>>>0);j=(c[n>>2]|0)==0?n+4|0:n;if(!q){n=j;j=m;}else {c[m>>2]=q;n=j;j=m+4|0;}}else {n=(c[n>>2]|0)==0?n+4|0:n;j=m;}m=t?D:n;m=(j-m>>2|0)>(g|0)?m+(g<<2)|0:j;j=(c[u>>2]|0)+s|0;c[u>>2]=j;}while((j|0)<0);j=n;g=m;}else {j=n;g=m;}y=D;if(j>>>0<g>>>0){m=(y-j>>2)*9|0;o=c[j>>2]|0;if(o>>>0>=10){n=10;do{n=n*10|0;m=m+1|0;}while(o>>>0>=n>>>0)}}else m=0;t=(w|0)==103;v=(k|0)!=0;n=k-((w|0)!=102?m:0)+((v&t)<<31>>31)|0;if((n|0)<(((g-y>>2)*9|0)+-9|0)){n=n+9216|0;s=D+4+(((n|0)/9|0)+-1024<<2)|0;n=(n|0)%9|0;if((n|0)<8){o=10;while(1){o=o*10|0;if((n|0)<7)n=n+1|0;else break}}else o=10;p=c[s>>2]|0;q=(p>>>0)%(o>>>0)|0;n=(s+4|0)==(g|0);if(!(n&(q|0)==0)){r=(((p>>>0)/(o>>>0)|0)&1|0)==0?9007199254740992.0:9007199254740994.0;x=(o|0)/2|0;e=q>>>0<x>>>0?.5:n&(q|0)==(x|0)?1.0:1.5;if(C){x=(a[B>>0]|0)==45;e=x?-e:e;r=x?-r:r;}n=p-q|0;c[s>>2]=n;if(r+e!=r){x=n+o|0;c[s>>2]=x;if(x>>>0>999999999){m=s;while(1){n=m+-4|0;c[m>>2]=0;if(n>>>0<j>>>0){j=j+-4|0;c[j>>2]=0;}x=(c[n>>2]|0)+1|0;c[n>>2]=x;if(x>>>0>999999999)m=n;else break}}else n=s;m=(y-j>>2)*9|0;p=c[j>>2]|0;if(p>>>0>=10){o=10;do{o=o*10|0;m=m+1|0;}while(p>>>0>=o>>>0)}}else n=s;}else n=s;n=n+4|0;n=g>>>0>n>>>0?n:g;x=j;}else {n=g;x=j;}w=n;while(1){if(w>>>0<=x>>>0){u=0;break}j=w+-4|0;if(!(c[j>>2]|0))w=j;else {u=1;break}}g=0-m|0;do if(t){j=k+((v^1)&1)|0;if((j|0)>(m|0)&(m|0)>-5){o=i+-1|0;k=j+-1-m|0;}else {o=i+-2|0;k=j+-1|0;}j=h&8;if(!j){if(u?(A=c[w+-4>>2]|0,(A|0)!=0):0)if(!((A>>>0)%10|0)){n=0;j=10;do{j=j*10|0;n=n+1|0;}while(!((A>>>0)%(j>>>0)|0|0))}else n=0;else n=9;j=((w-y>>2)*9|0)+-9|0;if((o|32|0)==102){s=j-n|0;s=(s|0)>0?s:0;k=(k|0)<(s|0)?k:s;s=0;break}else {s=j+m-n|0;s=(s|0)>0?s:0;k=(k|0)<(s|0)?k:s;s=0;break}}else s=j;}else {o=i;s=h&8;}while(0);t=k|s;p=(t|0)!=0&1;q=(o|32|0)==102;if(q){v=0;j=(m|0)>0?m:0;}else {j=(m|0)<0?g:m;j=Ya(j,((j|0)<0)<<31>>31,E)|0;n=E;if((n-j|0)<2)do{j=j+-1|0;a[j>>0]=48;}while((n-j|0)<2);a[j+-1>>0]=(m>>31&2)+43;j=j+-2|0;a[j>>0]=o;v=j;j=n-j|0;}j=C+1+k+p+j|0;$a(b,32,f,j,h);Ta(b,B,C);$a(b,48,f,j,h^65536);if(q){o=x>>>0>D>>>0?D:x;s=G+9|0;p=s;q=G+8|0;n=o;do{m=Ya(c[n>>2]|0,0,s)|0;if((n|0)==(o|0)){if((m|0)==(s|0)){a[q>>0]=48;m=q;}}else if(m>>>0>G>>>0){Cb(G|0,48,m-F|0)|0;do m=m+-1|0;while(m>>>0>G>>>0)}Ta(b,m,p-m|0);n=n+4|0;}while(n>>>0<=D>>>0);if(t|0)Ta(b,1117,1);if(n>>>0<w>>>0&(k|0)>0)while(1){m=Ya(c[n>>2]|0,0,s)|0;if(m>>>0>G>>>0){Cb(G|0,48,m-F|0)|0;do m=m+-1|0;while(m>>>0>G>>>0)}Ta(b,m,(k|0)<9?k:9);n=n+4|0;m=k+-9|0;if(!(n>>>0<w>>>0&(k|0)>9)){k=m;break}else k=m;}$a(b,48,k+9|0,9,0);}else {t=u?w:x+4|0;if((k|0)>-1){u=G+9|0;s=(s|0)==0;g=u;p=0-F|0;q=G+8|0;o=x;do{m=Ya(c[o>>2]|0,0,u)|0;if((m|0)==(u|0)){a[q>>0]=48;m=q;}do if((o|0)==(x|0)){n=m+1|0;Ta(b,m,1);if(s&(k|0)<1){m=n;break}Ta(b,1117,1);m=n;}else {if(m>>>0<=G>>>0)break;Cb(G|0,48,m+p|0)|0;do m=m+-1|0;while(m>>>0>G>>>0)}while(0);F=g-m|0;Ta(b,m,(k|0)>(F|0)?F:k);k=k-F|0;o=o+4|0;}while(o>>>0<t>>>0&(k|0)>-1)}$a(b,48,k+18|0,18,0);Ta(b,v,E-v|0);}$a(b,32,f,j,h^8192);}while(0);l=H;return ((j|0)<(f|0)?f:j)|0}function cb(a){a=+a;var b=0;h[j>>3]=a;b=c[j>>2]|0;z=c[j+4>>2]|0;return b|0}function db(a,b){a=+a;b=b|0;return +(+eb(a,b))}function eb(a,b){a=+a;b=b|0;var d=0,e=0,f=0;h[j>>3]=a;d=c[j>>2]|0;e=c[j+4>>2]|0;f=yb(d|0,e|0,52)|0;switch(f&2047){case 0:{if(a!=0.0){a=+eb(a*18446744073709551616.0,b);d=(c[b>>2]|0)+-64|0;}else d=0;c[b>>2]=d;break}case 2047:break;default:{c[b>>2]=(f&2047)+-1022;c[j>>2]=d;c[j+4>>2]=e&-2146435073|1071644672;a=+h[j>>3];}}return +a}function fb(b,d,e){b=b|0;d=d|0;e=e|0;do if(b){if(d>>>0<128){a[b>>0]=d;b=1;break}if(!(c[c[(gb()|0)+188>>2]>>2]|0))if((d&-128|0)==57216){a[b>>0]=d;b=1;break}else {c[(Ka()|0)>>2]=84;b=-1;break}if(d>>>0<2048){a[b>>0]=d>>>6|192;a[b+1>>0]=d&63|128;b=2;break}if(d>>>0<55296|(d&-8192|0)==57344){a[b>>0]=d>>>12|224;a[b+1>>0]=d>>>6&63|128;a[b+2>>0]=d&63|128;b=3;break}if((d+-65536|0)>>>0<1048576){a[b>>0]=d>>>18|240;a[b+1>>0]=d>>>12&63|128;a[b+2>>0]=d>>>6&63|128;a[b+3>>0]=d&63|128;b=4;break}else {c[(Ka()|0)>>2]=84;b=-1;break}}else b=1;while(0);return b|0}function gb(){return hb()|0}function hb(){return 332}function ib(){return hb()|0}function jb(b,e){b=b|0;e=e|0;var f=0,g=0;g=0;while(1){if((d[1119+g>>0]|0)==(b|0)){b=2;break}f=g+1|0;if((f|0)==87){f=1207;g=87;b=5;break}else g=f;}if((b|0)==2)if(!g)f=1207;else {f=1207;b=5;}if((b|0)==5)while(1){do{b=f;f=f+1|0;}while((a[b>>0]|0)!=0);g=g+-1|0;if(!g)break;else b=5;}return kb(f,c[e+20>>2]|0)|0}function kb(a,b){a=a|0;b=b|0;return lb(a,b)|0}function lb(a,b){a=a|0;b=b|0;if(!b)b=0;else b=mb(c[b>>2]|0,c[b+4>>2]|0,a)|0;return (b|0?b:a)|0}function mb(b,d,e){b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,i=0,j=0,k=0,l=0,m=0,n=0,o=0;o=(c[b>>2]|0)+1794895138|0;h=nb(c[b+8>>2]|0,o)|0;f=nb(c[b+12>>2]|0,o)|0;g=nb(c[b+16>>2]|0,o)|0;a:do if((h>>>0<d>>>2>>>0?(n=d-(h<<2)|0,f>>>0<n>>>0&g>>>0<n>>>0):0)?((g|f)&3|0)==0:0){n=f>>>2;m=g>>>2;l=0;while(1){j=h>>>1;k=l+j|0;i=k<<1;g=i+n|0;f=nb(c[b+(g<<2)>>2]|0,o)|0;g=nb(c[b+(g+1<<2)>>2]|0,o)|0;if(!(g>>>0<d>>>0&f>>>0<(d-g|0)>>>0)){f=0;break a}if(a[b+(g+f)>>0]|0){f=0;break a}f=Na(e,b+g|0)|0;if(!f)break;f=(f|0)<0;if((h|0)==1){f=0;break a}else {l=f?l:k;h=f?j:h-j|0;}}f=i+m|0;g=nb(c[b+(f<<2)>>2]|0,o)|0;f=nb(c[b+(f+1<<2)>>2]|0,o)|0;if(f>>>0<d>>>0&g>>>0<(d-f|0)>>>0)f=(a[b+(f+g)>>0]|0)==0?b+f|0:0;else f=0;}else f=0;while(0);return f|0}function nb(a,b){a=a|0;b=b|0;var c=0;c=Ab(a|0)|0;return ((b|0)==0?a:c)|0}function ob(b,d,e){b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,i=0,j=0;f=e+16|0;g=c[f>>2]|0;if(!g)if(!(pb(e)|0)){g=c[f>>2]|0;h=5;}else f=0;else h=5;a:do if((h|0)==5){j=e+20|0;i=c[j>>2]|0;f=i;if((g-i|0)>>>0<d>>>0){f=ga[c[e+36>>2]&3](e,b,d)|0;break}b:do if((a[e+75>>0]|0)>-1){i=d;while(1){if(!i){h=0;g=b;break b}g=i+-1|0;if((a[b+g>>0]|0)==10)break;else i=g;}f=ga[c[e+36>>2]&3](e,b,i)|0;if(f>>>0<i>>>0)break a;h=i;g=b+i|0;d=d-i|0;f=c[j>>2]|0;}else {h=0;g=b;}while(0);Bb(f|0,g|0,d|0)|0;c[j>>2]=(c[j>>2]|0)+d;f=h+d|0;}while(0);return f|0}function pb(b){b=b|0;var d=0,e=0;d=b+74|0;e=a[d>>0]|0;a[d>>0]=e+255|e;d=c[b>>2]|0;if(!(d&8)){c[b+8>>2]=0;c[b+4>>2]=0;e=c[b+44>>2]|0;c[b+28>>2]=e;c[b+20>>2]=e;c[b+16>>2]=e+(c[b+48>>2]|0);b=0;}else {c[b>>2]=d|32;b=-1;}return b|0}function qb(a,b){a=a|0;b=b|0;var d=0,e=0;d=l;l=l+16|0;e=d;c[e>>2]=b;b=Pa(c[51]|0,a,e)|0;l=d;return b|0}function rb(){}function sb(a,b,c,d){a=a|0;b=b|0;c=c|0;d=d|0;c=a+c>>>0;return (z=b+d+(c>>>0<a>>>0|0)>>>0,c|0)|0}function tb(a,b,c,d){a=a|0;b=b|0;c=c|0;d=d|0;d=b-d-(c>>>0>a>>>0|0)>>>0;return (z=d,a-c>>>0|0)|0}function ub(b){b=b|0;var c=0;c=a[n+(b&255)>>0]|0;if((c|0)<8)return c|0;c=a[n+(b>>8&255)>>0]|0;if((c|0)<8)return c+8|0;c=a[n+(b>>16&255)>>0]|0;if((c|0)<8)return c+16|0;return (a[n+(b>>>24)>>0]|0)+24|0}function vb(a,b,d,e,f){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;var g=0,h=0,i=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0;l=a;j=b;k=j;h=d;n=e;i=n;if(!k){g=(f|0)!=0;if(!i){if(g){c[f>>2]=(l>>>0)%(h>>>0);c[f+4>>2]=0;}n=0;f=(l>>>0)/(h>>>0)>>>0;return (z=n,f)|0}else {if(!g){n=0;f=0;return (z=n,f)|0}c[f>>2]=a|0;c[f+4>>2]=b&0;n=0;f=0;return (z=n,f)|0}}g=(i|0)==0;do if(h){if(!g){g=(R(i|0)|0)-(R(k|0)|0)|0;if(g>>>0<=31){m=g+1|0;i=31-g|0;b=g-31>>31;h=m;a=l>>>(m>>>0)&b|k<<i;b=k>>>(m>>>0)&b;g=0;i=l<<i;break}if(!f){n=0;f=0;return (z=n,f)|0}c[f>>2]=a|0;c[f+4>>2]=j|b&0;n=0;f=0;return (z=n,f)|0}g=h-1|0;if(g&h|0){i=(R(h|0)|0)+33-(R(k|0)|0)|0;p=64-i|0;m=32-i|0;j=m>>31;o=i-32|0;b=o>>31;h=i;a=m-1>>31&k>>>(o>>>0)|(k<<m|l>>>(i>>>0))&b;b=b&k>>>(i>>>0);g=l<<p&j;i=(k<<p|l>>>(o>>>0))&j|l<<m&i-33>>31;break}if(f|0){c[f>>2]=g&l;c[f+4>>2]=0;}if((h|0)==1){o=j|b&0;p=a|0|0;return (z=o,p)|0}else {p=ub(h|0)|0;o=k>>>(p>>>0)|0;p=k<<32-p|l>>>(p>>>0)|0;return (z=o,p)|0}}else {if(g){if(f|0){c[f>>2]=(k>>>0)%(h>>>0);c[f+4>>2]=0;}o=0;p=(k>>>0)/(h>>>0)>>>0;return (z=o,p)|0}if(!l){if(f|0){c[f>>2]=0;c[f+4>>2]=(k>>>0)%(i>>>0);}o=0;p=(k>>>0)/(i>>>0)>>>0;return (z=o,p)|0}g=i-1|0;if(!(g&i)){if(f|0){c[f>>2]=a|0;c[f+4>>2]=g&k|b&0;}o=0;p=k>>>((ub(i|0)|0)>>>0);return (z=o,p)|0}g=(R(i|0)|0)-(R(k|0)|0)|0;if(g>>>0<=30){b=g+1|0;i=31-g|0;h=b;a=k<<i|l>>>(b>>>0);b=k>>>(b>>>0);g=0;i=l<<i;break}if(!f){o=0;p=0;return (z=o,p)|0}c[f>>2]=a|0;c[f+4>>2]=j|b&0;o=0;p=0;return (z=o,p)|0}while(0);if(!h){k=i;j=0;i=0;}else {m=d|0|0;l=n|e&0;k=sb(m|0,l|0,-1,-1)|0;d=z;j=i;i=0;do{e=j;j=g>>>31|j<<1;g=i|g<<1;e=a<<1|e>>>31|0;n=a>>>31|b<<1|0;tb(k|0,d|0,e|0,n|0)|0;p=z;o=p>>31|((p|0)<0?-1:0)<<1;i=o&1;a=tb(e|0,n|0,o&m|0,(((p|0)<0?-1:0)>>31|((p|0)<0?-1:0)<<1)&l|0)|0;b=z;h=h-1|0;}while((h|0)!=0);k=j;j=0;}h=0;if(f|0){c[f>>2]=a;c[f+4>>2]=b;}o=(g|0)>>>31|(k|h)<<1|(h<<1|g>>>31)&0|j;p=(g<<1|0>>>31)&-2|i;return (z=o,p)|0}function wb(a,b,c,d){a=a|0;b=b|0;c=c|0;d=d|0;return vb(a,b,c,d,0)|0}function xb(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0,g=0;g=l;l=l+16|0;f=g|0;vb(a,b,d,e,f)|0;l=g;return (z=c[f+4>>2]|0,c[f>>2]|0)|0}function yb(a,b,c){a=a|0;b=b|0;c=c|0;if((c|0)<32){z=b>>>c;return a>>>c|(b&(1<<c)-1)<<32-c}z=0;return b>>>c-32|0}function zb(a,b,c){a=a|0;b=b|0;c=c|0;if((c|0)<32){z=b<<c|(a&(1<<c)-1<<32-c)>>>32-c;return a<<c}z=a<<c-32;return 0}function Ab(a){a=a|0;return (a&255)<<24|(a>>8&255)<<16|(a>>16&255)<<8|a>>>24|0}function Bb(b,d,e){b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0;if((e|0)>=8192)return ca(b|0,d|0,e|0)|0;h=b|0;g=b+e|0;if((b&3)==(d&3)){while(b&3){if(!e)return h|0;a[b>>0]=a[d>>0]|0;b=b+1|0;d=d+1|0;e=e-1|0;}e=g&-4|0;f=e-64|0;while((b|0)<=(f|0)){c[b>>2]=c[d>>2];c[b+4>>2]=c[d+4>>2];c[b+8>>2]=c[d+8>>2];c[b+12>>2]=c[d+12>>2];c[b+16>>2]=c[d+16>>2];c[b+20>>2]=c[d+20>>2];c[b+24>>2]=c[d+24>>2];c[b+28>>2]=c[d+28>>2];c[b+32>>2]=c[d+32>>2];c[b+36>>2]=c[d+36>>2];c[b+40>>2]=c[d+40>>2];c[b+44>>2]=c[d+44>>2];c[b+48>>2]=c[d+48>>2];c[b+52>>2]=c[d+52>>2];c[b+56>>2]=c[d+56>>2];c[b+60>>2]=c[d+60>>2];b=b+64|0;d=d+64|0;}while((b|0)<(e|0)){c[b>>2]=c[d>>2];b=b+4|0;d=d+4|0;}}else {e=g-4|0;while((b|0)<(e|0)){a[b>>0]=a[d>>0]|0;a[b+1>>0]=a[d+1>>0]|0;a[b+2>>0]=a[d+2>>0]|0;a[b+3>>0]=a[d+3>>0]|0;b=b+4|0;d=d+4|0;}}while((b|0)<(g|0)){a[b>>0]=a[d>>0]|0;b=b+1|0;d=d+1|0;}return h|0}function Cb(b,d,e){b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,i=0;h=b+e|0;d=d&255;if((e|0)>=67){while(b&3){a[b>>0]=d;b=b+1|0;}f=h&-4|0;g=f-64|0;i=d|d<<8|d<<16|d<<24;while((b|0)<=(g|0)){c[b>>2]=i;c[b+4>>2]=i;c[b+8>>2]=i;c[b+12>>2]=i;c[b+16>>2]=i;c[b+20>>2]=i;c[b+24>>2]=i;c[b+28>>2]=i;c[b+32>>2]=i;c[b+36>>2]=i;c[b+40>>2]=i;c[b+44>>2]=i;c[b+48>>2]=i;c[b+52>>2]=i;c[b+56>>2]=i;c[b+60>>2]=i;b=b+64|0;}while((b|0)<(f|0)){c[b>>2]=i;b=b+4|0;}}while((b|0)<(h|0)){a[b>>0]=d;b=b+1|0;}return h-e|0}function Db(a){a=a|0;var b=0,d=0;d=c[i>>2]|0;b=d+a|0;if((a|0)>0&(b|0)<(d|0)|(b|0)<0){W()|0;Z(12);return -1}c[i>>2]=b;if((b|0)>(V()|0)?(U()|0)==0:0){c[i>>2]=d;Z(12);return -1}return d|0}function Eb(a,b){a=a|0;b=b|0;return fa[a&1](b|0)|0}function Fb(a,b,c,d){a=a|0;b=b|0;c=c|0;d=d|0;return ga[a&3](b|0,c|0,d|0)|0}function Gb(a){a=a|0;S(0);return 0}function Hb(a,b,c){a=a|0;b=b|0;c=c|0;S(1);return 0}

// EMSCRIPTEN_END_FUNCS
var fa=[Gb,Ga];var ga=[Hb,Ma,Ia,Ha];return {_KangarooTwelve_Final:ya,_KangarooTwelve_Initialize:wa,_KangarooTwelve_IsAbsorbing:Ca,_KangarooTwelve_IsSqueezing:Ba,_KangarooTwelve_Squeeze:za,_KangarooTwelve_Update:xa,_KangarooTwelve_phase:Da,_NewKangarooTwelve:Aa,___errno_location:Ka,___udivdi3:wb,___uremdi3:xb,_bitshift64Lshr:yb,_bitshift64Shl:zb,_free:Fa,_i64Add:sb,_i64Subtract:tb,_llvm_bswap_i32:Ab,_malloc:Ea,_memcpy:Bb,_memset:Cb,_sbrk:Db,dynCall_ii:Eb,dynCall_iiii:Fb,establishStackSpace:ka,getTempRet0:na,runPostSets:rb,setTempRet0:ma,setThrew:la,stackAlloc:ha,stackRestore:ja,stackSave:ia}})


// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg,Module.asmLibraryArg,buffer);var _KangarooTwelve_Final=Module["_KangarooTwelve_Final"]=asm["_KangarooTwelve_Final"];var _KangarooTwelve_Initialize=Module["_KangarooTwelve_Initialize"]=asm["_KangarooTwelve_Initialize"];var _KangarooTwelve_IsAbsorbing=Module["_KangarooTwelve_IsAbsorbing"]=asm["_KangarooTwelve_IsAbsorbing"];var _KangarooTwelve_IsSqueezing=Module["_KangarooTwelve_IsSqueezing"]=asm["_KangarooTwelve_IsSqueezing"];var _KangarooTwelve_Squeeze=Module["_KangarooTwelve_Squeeze"]=asm["_KangarooTwelve_Squeeze"];var _KangarooTwelve_Update=Module["_KangarooTwelve_Update"]=asm["_KangarooTwelve_Update"];var _KangarooTwelve_phase=Module["_KangarooTwelve_phase"]=asm["_KangarooTwelve_phase"];var _NewKangarooTwelve=Module["_NewKangarooTwelve"]=asm["_NewKangarooTwelve"];var ___errno_location=Module["___errno_location"]=asm["___errno_location"];var ___udivdi3=Module["___udivdi3"]=asm["___udivdi3"];var ___uremdi3=Module["___uremdi3"]=asm["___uremdi3"];var _bitshift64Lshr=Module["_bitshift64Lshr"]=asm["_bitshift64Lshr"];var _bitshift64Shl=Module["_bitshift64Shl"]=asm["_bitshift64Shl"];var _free=Module["_free"]=asm["_free"];var _i64Add=Module["_i64Add"]=asm["_i64Add"];var _i64Subtract=Module["_i64Subtract"]=asm["_i64Subtract"];var _llvm_bswap_i32=Module["_llvm_bswap_i32"]=asm["_llvm_bswap_i32"];var _malloc=Module["_malloc"]=asm["_malloc"];var _memcpy=Module["_memcpy"]=asm["_memcpy"];var _memset=Module["_memset"]=asm["_memset"];var _sbrk=Module["_sbrk"]=asm["_sbrk"];var establishStackSpace=Module["establishStackSpace"]=asm["establishStackSpace"];var getTempRet0=Module["getTempRet0"]=asm["getTempRet0"];var runPostSets=Module["runPostSets"]=asm["runPostSets"];var setTempRet0=Module["setTempRet0"]=asm["setTempRet0"];var setThrew=Module["setThrew"]=asm["setThrew"];var stackAlloc=Module["stackAlloc"]=asm["stackAlloc"];var stackRestore=Module["stackRestore"]=asm["stackRestore"];var stackSave=Module["stackSave"]=asm["stackSave"];var dynCall_ii=Module["dynCall_ii"]=asm["dynCall_ii"];var dynCall_iiii=Module["dynCall_iiii"]=asm["dynCall_iiii"];
Module["asm"]=asm;
Module["stringToUTF8"]=stringToUTF8;Module["lengthBytesUTF8"]=lengthBytesUTF8;
if(memoryInitializer){
	if(ENVIRONMENT_IS_NODE||ENVIRONMENT_IS_SHELL){var data=Module["readBinary"](memoryInitializer);HEAPU8.set(data,GLOBAL_BASE);}else {addRunDependency();var applyMemoryInitializer=(function(data){if(data.byteLength)data=new Uint8Array(data);HEAPU8.set(data,GLOBAL_BASE);if(Module["memoryInitializerRequest"])delete Module["memoryInitializerRequest"].response;removeRunDependency();});function doBrowserLoad(){Module["readAsync"](memoryInitializer,applyMemoryInitializer,(function(){throw "could not load memory initializer "+memoryInitializer}));}var memoryInitializerBytes=tryParseAsDataURI(memoryInitializer);if(memoryInitializerBytes){applyMemoryInitializer(memoryInitializerBytes.buffer);}else if(Module["memoryInitializerRequest"]){function useRequest(){var request=Module["memoryInitializerRequest"];var response=request.response;if(request.status!==200&&request.status!==0){var data=tryParseAsDataURI(Module["memoryInitializerRequestURL"]);if(data){response=data.buffer;}else {console.warn("a problem seems to have happened with Module.memoryInitializerRequest, status: "+request.status+", retrying "+memoryInitializer);doBrowserLoad();return}}applyMemoryInitializer(response);}if(Module["memoryInitializerRequest"].response){setTimeout(useRequest,0);}else {Module["memoryInitializerRequest"].addEventListener("load",useRequest);}}else {doBrowserLoad();}}}function ExitStatus(status){this.name="ExitStatus";this.message="Program terminated with exit("+status+")";this.status=status;}ExitStatus.prototype=new Error;ExitStatus.prototype.constructor=ExitStatus;var initialStackTop;dependenciesFulfilled=function runCaller(){if(!Module["calledRun"])run();if(!Module["calledRun"])dependenciesFulfilled=runCaller;};function run(args){if(runDependencies>0){return}preRun();if(runDependencies>0)return;if(Module["calledRun"])return;function doRun(){if(Module["calledRun"])return;Module["calledRun"]=true;if(ABORT)return;ensureInitRuntime();preMain();if(Module["onRuntimeInitialized"])Module["onRuntimeInitialized"]();postRun();}if(Module["setStatus"]){Module["setStatus"]("Running...");setTimeout((function(){setTimeout((function(){Module["setStatus"]("");}),1);doRun();}),1);}else {doRun();}}Module["run"]=run;function exit(status,implicit){if(implicit&&Module["noExitRuntime"]&&status===0){return}if(Module["noExitRuntime"]);else {ABORT=true;STACKTOP=initialStackTop;exitRuntime();if(Module["onExit"])Module["onExit"](status);}if(ENVIRONMENT_IS_NODE){process["exit"](status);}Module["quit"](status,new ExitStatus(status));}Module["exit"]=exit;function abort(what){if(Module["onAbort"]){Module["onAbort"](what);}if(what!==undefined){Module.print(what);Module.printErr(what);what=JSON.stringify(what);}else {what="";}ABORT=true;throw "abort("+what+"). Build with -s ASSERTIONS=1 for more info."}Module["abort"]=abort;
        if(Module["preInit"]){if(typeof Module["preInit"]=="function")Module["preInit"]=[Module["preInit"]];while(Module["preInit"].length>0){Module["preInit"].pop()();}}Module["noExitRuntime"]=true;run();
	module.exports = Module;
	return module.exports;
}  )(k12Module);



function SaltyRNG(f, opt) {

	const readBufs = [];
	const K12_SQUEEZE_LENGTH = 32768;

	const shabuf = opt?( opt.mode === 0 )?new SHA256() : null
                          : new SHA256();
	const k12buf = opt?( opt.mode === 1 )?KangarooTwelve() : null
                          : null;

	function MASK_TOP_MASK(length) {
		return (0xFF) >>> (8 - (length))
	}
	function MY_MASK_MASK(n, length) {
		return (MASK_TOP_MASK(length) << ((n) & 0x7)) & 0xFF;
	}
	function MY_GET_MASK(v, n, mask_size) {
		return (v[(n) >> 3] & MY_MASK_MASK(n, mask_size)) >>> (((n)) & 0x7)
	}

	function compute(buf) {

		if( shabuf ) {
			var h = new Array(32);
			shabuf.update(buf).finish(h).clean();
			//console.log( "RESULT HASH?", h );
			return h;
		} else if( k12buf ) {	
			k12buf.update(buf);		
			k12buf.final();
			return k12buf.squeeze( 64 );
		} else  {
			console.log( "no engine for salty generator" );
		}
	}
	var RNG = {
		getSalt: f,
		feed(buf) {
			if( typeof buf === "string" )
				buf = toUTF8Array( buf );
			if( shabuf )
				shabuf.update(buf);
			else
				k12buf.update(buf);
		},
		saltbuf: [],
		entropy: null,
		available: 0,
		used: 0,
		total_bits : 0,
		initialEntropy : "test",
		save() {
			return {
				saltbuf: this.saltbuf.slice(0),
				entropy: this.entropy?this.entropy.slice(0):null,
				available: this.available,
				used: this.used,
				state : shabuf?shabuf.clone():( k12buf ? k12buf.clone():null )
			}
		},
		restore(oldState) {
			this.saltbuf = oldState.saltbuf.slice(0);
			this.entropy = oldState.entropy?oldState.entropy.slice(0):null;
			this.available = oldState.available;
			this.used = oldState.used;
			//throw new Error( "RESTORE STATE IS BROKEN." );
			shabuf && shabuf.copy( oldState.state );
			k12buf && k12buf.copy( oldState.state );
		},
		reset() {
			this.entropy = 
				this.initialEntropy
					?compute(this.initialEntropy)
					:null;
			this.available = 0;
			this.used = 0;
			this.total_bits = 0;
			if( shabuf )
				shabuf.clean();
			if( k12buf ) {
				k12buf.init();
			}
		},
		getByte() {
			if( this.used & 0x7 ) {
				const buf = this.getBuffer_(8).u8;
				const val = buf[0];
				readBufs[8].push( buf );
				return val;
		
			} else {
				if(this.available === this.used)
					needBits();
				this.total_bits += 8;
				var result = this.entropy[(this.used) >> 3];
				this.used += 8;
				return result;
			}
		},
		getBits(count, signed) {
			if( !count ) { count = 32; signed = true; } 
			if (count > 32)
				throw "Use getBuffer for more than 32 bits.";
			var tmp = this.getBuffer_(count);
			if( !tmp.u32 ) tmp.u32 = new Uint32Array(tmp.ab);
			var val = tmp.u32[0];
			if( signed ) {
				if(  val & ( 1 << (count-1) ) ) { // sign extend
					var negone = ~0;
					negone <<= (count-1);
					val |= negone;
				}
			}
			readBufs[count].push( tmp );
			return val;
		},
		getBuffer(bits) {
			return this.getBuffer_(bits).u8;
		},
		getBuffer_(bits) {
			let resultIndex = 0;
			let resultBits = 0;
			if( readBufs.length <= bits ) { for( let zz = readBufs.length; zz <= bits; zz++ ) readBufs.push([]); }
			let resultBuffer = readBufs[bits].length?readBufs[bits].pop():{ab:new ArrayBuffer(4 * ((bits + 31) >> 5)),u8:null,u32:null};
			let result = resultBuffer.u8?resultBuffer.u8:(resultBuffer.u8 = new Uint8Array(resultBuffer.ab) );
			//result.ab = resultBuffer.ab;
			for( let zz = 0; zz < result.length; zz++ ) result[zz] = 0;
			this.total_bits += bits;
			{
				let tmp;
				let partial_tmp;
				let partial_bits = 0;
				let get_bits;

				do {
					if (bits > 8)
						get_bits = 8;
					else
						get_bits = bits;
					// if there were 1-7 bits of data in partial, then can only get 8-partial max.
					if( (8-partial_bits) < get_bits )
						get_bits = (8-partial_bits);
					// if get_bits == 8
					//    but bits_used is 1-7, then it would have to pull 2 bytes to get the 8 required
					//    so truncate get_bits to 1-7 bits
					let chunk = ( 8 - ( this.used & 7) );
					if( chunk < get_bits )
						get_bits = chunk;
					// if resultBits is 1-7 offset, then would have to store up to 2 bytes of value
					//    so have to truncate to just the up to 1 bytes that will fit.
					chunk = ( 8 - ( resultBits & 7) );
					if( chunk < get_bits )
						get_bits = chunk;

					//console.log( "Get bits:", get_bits, " after", this.used, "into", resultBits );
					// only greater... if equal just grab the bits.
					if (get_bits > (this.available - this.used)) {
						if (this.available - this.used) {
							partial_bits = this.available - this.used;
							// partial can never be greater than 8; request is never greater than 8
							//if (partial_bits > 8)
							//	partial_bits = 8;
							partial_tmp = MY_GET_MASK(this.entropy, this.used, partial_bits);
						}
						needBits();
						bits -= partial_bits;
					}
					else {
						tmp = MY_GET_MASK(this.entropy, this.used, get_bits);
						this.used += get_bits;
						if (partial_bits) {
							tmp = partial_tmp | (tmp << partial_bits);
							partial_bits = 0;
						}
						
						result[resultIndex] |= tmp << (resultBits&7);
						resultBits += get_bits;
						// because of input limits, total result bits can only be 8 or less.
						if( resultBits == 8 ) {
							resultIndex++;
							resultBits = 0;
						}
						bits -= get_bits;
					}
				} while (bits);
				//console.log( "output is ", result[0].toString(16), result[1].toString(16), result[2].toString(16), result[3].toString(16) )
				return resultBuffer;
			}
		}
	};
	function needBits() {
		RNG.saltbuf.length = 0;
		if( k12buf ) {
			if( !k12buf.phase() )
				console.trace( "PLEASE INIT THIS USAGE!" );
			//console.log( "BUF IS:", k12buf.absorbing()?"absorbing":"??", k12buf.squeezing()?"squeezing":"!!", k12buf.phase(),( k12buf.absorbing() || ( RNG.total_bits > K12_SQUEEZE_LENGTH ) ) )
			if( k12buf.absorbing() || ( RNG.total_bits >= K12_SQUEEZE_LENGTH ) ) {
				if( k12buf.squeezing() ) {
	                                //console.log( "Need to init with new entropy (BIT FORCE)" );
					k12buf.init();
					k12buf.update( RNG.entropy );
				}
				if (typeof (RNG.getSalt) === 'function') {
					RNG.getSalt(RNG.saltbuf);
					if( RNG.saltbuf.length )
						k12buf.update( RNG.saltbuf );

				}
				k12buf.final();
				RNG.used = 0;
			}
			if( k12buf.squeezing() ) {
				RNG.entropy = k12buf.squeeze(64); // customization is a final pad string.
			}
		}
		if( shabuf ) {
			if (typeof (RNG.getSalt) === 'function')
				RNG.getSalt(RNG.saltbuf);
			//console.log( "saltbuf.join = ", RNG.saltbuf.join(), RNG.saltbuf.length );
			var newbuf;
			if( RNG.saltbuf.length ) {
				if( !RNG.entropy )
					RNG.entropy = new Uint8Array(32);
				newbuf = toUTF8Array( RNG.saltbuf.join() );
				shabuf.update(newbuf).finish(RNG.entropy).clean();
				shabuf.update(RNG.entropy);
			}
			else {
				if( !RNG.entropy )
					RNG.entropy = new Uint8Array(32);
				shabuf.finish(RNG.entropy).clean();
				shabuf.update(RNG.entropy);
			}
		}
		RNG.available = RNG.entropy.length * 8;
		RNG.used = 0;
	}	RNG.reset();
	return RNG;
}

//------------------ SHA256 support

/* Taken from https://github.com/brillout/forge-sha256
 * which itself is taken from https://github.com/digitalbazaar/forge/tree/3b7826f7c2735c42b41b7ceaaadaad570e92d898
 */

// this is just the working bits of the above.

var K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
	0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
	0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
	0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
	0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
	0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
	0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
	0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
	0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
	0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
	0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
	0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function blocks(w, v, p, pos, len) {
	var a, b, c, d, e, f, g, h, u, i, j, t1, t2;
	while (len >= 64) {
		a = v[0];
		b = v[1];
		c = v[2];
		d = v[3];
		e = v[4];
		f = v[5];
		g = v[6];
		h = v[7];

		for (i = 0; i < 16; i++) {
			j = pos + i * 4;
			w[i] = (((p[j] & 0xff) << 24) | ((p[j + 1] & 0xff) << 16) |
				((p[j + 2] & 0xff) << 8) | (p[j + 3] & 0xff));
		}

		for (i = 16; i < 64; i++) {
			u = w[i - 2];
			t1 = (u >>> 17 | u << (32 - 17)) ^ (u >>> 19 | u << (32 - 19)) ^ (u >>> 10);

			u = w[i - 15];
			t2 = (u >>> 7 | u << (32 - 7)) ^ (u >>> 18 | u << (32 - 18)) ^ (u >>> 3);

			w[i] = (t1 + w[i - 7] | 0) + (t2 + w[i - 16] | 0);
		}

		for (i = 0; i < 64; i++) {
			t1 = (((((e >>> 6 | e << (32 - 6)) ^ (e >>> 11 | e << (32 - 11)) ^
				(e >>> 25 | e << (32 - 25))) + ((e & f) ^ (~e & g))) | 0) +
				((h + ((K[i] + w[i]) | 0)) | 0)) | 0;

			t2 = (((a >>> 2 | a << (32 - 2)) ^ (a >>> 13 | a << (32 - 13)) ^
				(a >>> 22 | a << (32 - 22))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;

			h = g;
			g = f;
			f = e;
			e = (d + t1) | 0;
			d = c;
			c = b;
			b = a;
			a = (t1 + t2) | 0;
		}

		v[0] += a;
		v[1] += b;
		v[2] += c;
		v[3] += d;
		v[4] += e;
		v[5] += f;
		v[6] += g;
		v[7] += h;

		pos += 64;
		len -= 64;
	}
	return pos
}

function SHA256() {
	if( !(this instanceof SHA256) ) return new SHA256();
	this.v = new Uint32Array(8);
	this.w = new Int32Array(64);
	this.buf = new Uint8Array(128);
	this.buflen = 0;
	this.len = 0;
	this.reset();
}

SHA256.prototype.clone = function (){
	var x = new SHA256();
	x.v = this.v.slice(0);
	x.w = this.w.slice(0);
	x.buf = this.buf.slice(0);
	x.buflen = this.buflen;
	x.len = this.len;
	return x;
};

SHA256.prototype.copy = function (from){

	this.v = from.v.slice(0);
	this.w = from.w.slice(0);
	this.buf = from.buf.slice(0);
	this.buflen = from.buflen;
	this.len = from.len;
	return this;
};

SHA256.prototype.reset = function () {
	this.v[0] = 0x6a09e667;
	this.v[1] = 0xbb67ae85;
	this.v[2] = 0x3c6ef372;
	this.v[3] = 0xa54ff53a;
	this.v[4] = 0x510e527f;
	this.v[5] = 0x9b05688c;
	this.v[6] = 0x1f83d9ab;
	this.v[7] = 0x5be0cd19;
	this.buflen = 0;
	this.len = 0;
};

SHA256.prototype.clean = function () {
	var i;
	for (i = 0; i < this.buf.length; i++) this.buf[i] = 0;
	for (i = 0; i < this.w.length; i++) this.w[i] = 0;
	this.reset();
};

SHA256.prototype.update = function (m, len) {
	var mpos = 0, mlen = (typeof len !== 'undefined') ? len : m.length;
	this.len += mlen;
	if (this.buflen > 0) {
		while (this.buflen < 64 && mlen > 0) {
			this.buf[this.buflen++] = m[mpos++];
			mlen--;
		}
		if (this.buflen === 64) {
			blocks(this.w, this.v, this.buf, 0, 64);
			this.buflen = 0;
		}
	}
	if (mlen >= 64) {
		mpos = blocks(this.w, this.v, m, mpos, mlen);
		mlen %= 64;
		for( var buf_fill = mlen; buf_fill < 64; buf_fill++ )
			this.buf[buf_fill] = m[mpos-64 + buf_fill];
	}
	while (mlen > 0) {
		this.buf[this.buflen++] = m[mpos++];
		mlen--;
	}
	return this
};

SHA256.prototype.finish = function (h) {
	var mlen = this.len,
		left = this.buflen,
		bhi = (mlen / 0x20000000) | 0,
		blo = mlen << 3,
		padlen = (mlen % 64 < 56) ? 64 : 128,
		i;

	this.buf[left] = 0x80;
	for (i = left + 1; i < padlen - 8; i++) this.buf[i] = 0;
	this.buf[padlen - 8] = (bhi >>> 24) & 0xff;
	this.buf[padlen - 7] = (bhi >>> 16) & 0xff;
	this.buf[padlen - 6] = (bhi >>> 8) & 0xff;
	this.buf[padlen - 5] = (bhi >>> 0) & 0xff;
	this.buf[padlen - 4] = (blo >>> 24) & 0xff;
	this.buf[padlen - 3] = (blo >>> 16) & 0xff;
	this.buf[padlen - 2] = (blo >>> 8) & 0xff;
	this.buf[padlen - 1] = (blo >>> 0) & 0xff;

	blocks(this.w, this.v, this.buf, 0, padlen);

	for (i = 0; i < 8; i++) {
		h[i * 4 + 0] = (this.v[i] >>> 24) & 0xff;
		h[i * 4 + 1] = (this.v[i] >>> 16) & 0xff;
		h[i * 4 + 2] = (this.v[i] >>> 8) & 0xff;
		h[i * 4 + 3] = (this.v[i] >>> 0) & 0xff;
	}

	return this
};

function toUTF8Array(str) {
    var utf8 = [];
    for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
            utf8.push(0xc0 | (charcode >> 6),
                      0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
            utf8.push(0xe0 | (charcode >> 12),
                      0x80 | ((charcode>>6) & 0x3f),
                      0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
            i++;
            // UTF-16 encodes 0x10000-0x10FFFF by
            // subtracting 0x10000 and splitting the
            // 20 bits of 0x0-0xFFFFF into two halves
            charcode = 0x10000 + (((charcode & 0x3ff)<<10)
                      | (str.charCodeAt(i) & 0x3ff));
            utf8.push(0xf0 | (charcode >>18),
                      0x80 | ((charcode>>12) & 0x3f),
                      0x80 | ((charcode>>6) & 0x3f),
                      0x80 | (charcode & 0x3f));
        }
    }
    return utf8;
}



// Converts an ArrayBuffer directly to base64, without any intermediate 'convert to string then
// use window.btoa' step. According to my tests, this appears to be a faster approach:
// http://jsperf.com/encoding-xhr-image-data/5
// doesn't have to be reversable....

function KangarooTwelve() {
	const data = {
		k : 0,
		keybuf : 0,
		keybuflen : 0,
		buf : 0,
		bufMaps : new WeakMap(),
		outbuf : 0,
		realBuf : null,
	};
	var s;
	var K12 = {
		init() {
			s = k12._KangarooTwelve_Initialize( data.k, 0 );	
			//console.log( "Initialize S?", s );
		},
		drop() {
			k12._free( data.keybuf );
			k12._free( data.buf );
			k12._free( data.k );
			//console.log( "S?", s );
		},
		update(buf) {
			var byteLength;
			if( buf instanceof Array ) {
				buf = buf.join();
				byteLength = k12.lengthBytesUTF8( buf );
			} else if( "string" === typeof buf ) {
				byteLength = k12.lengthBytesUTF8( buf );
			} else if( buf instanceof Uint32Array ) {
				byteLength = buf.length * 4;
			} else if( buf instanceof Uint8Array ) {
				byteLength = buf.length;
			}

			if( byteLength > data.keybuflen ) {
				if( data.keybuf )
					k12._free( data.keybuf );
				data.keybuflen = byteLength*2+1;
				data.keybuf = k12._malloc( data.keybuflen );
		
			}
			if( "string" === typeof buf ) {
				k12.stringToUTF8( buf, data.keybuf, byteLength );
			}else if( buf instanceof Uint32Array ) {
				var keydata = new Uint32Array( k12.HEAPU32.buffer, data.keybuf, buf.length );
				//console.log( "copy keydata from binay", keydata );
				for( var b = 0; b < buf.length; b++ )
					keydata[b] = buf[b];
			}
			else if( buf instanceof Uint8Array ) {
				var keydata = new Uint8Array( k12.HEAPU8.buffer, data.keybuf, buf.length );
				//console.log( "copy keydata from binay", keydata );
				for( var b = 0; b < buf.length; b++ )
					keydata[b] = buf[b];
			}

			s = k12._KangarooTwelve_Update( data.k, data.keybuf, byteLength );
			//console.log( "Update S?", s );
		},
		final() {
			s = k12._KangarooTwelve_Final( data.k, 0, 0, 0 );
			//console.log( "Final S?", s );
		},
		squeeze(n) {
			s = k12._KangarooTwelve_Squeeze( data.k, data.outbuf, n );
			//data.realBuf = new Uint8Array( k12.HEAPU8.buffer, data.outbuf, 64 );
			//console.log( "Squeeze?", s, n );
			return data.realBuf;
		},
		release(buf) {
		},
		absorbing: null,
		squeezing: null,
		clone() {
                    console.log( "clone not implemented?" );
		},
		copy(from) {
                    console.log( "copy not implemented?" );
		},
		phase() {
			return k12._KangarooTwelve_phase( data.k );
		},
	};
	
	data.k = k12._NewKangarooTwelve();
	data.outbuf = k12._malloc( 64 );
	//console.log( "malloc:", data.outbuf );
	//data.realBuf = k12.HEAPU8.slice( data.outbuf, data.outbuf+64 );
	data.realBuf = new Uint8Array( k12.HEAPU8.buffer, data.outbuf, 64 );
	K12.absorbing = k12._KangarooTwelve_IsAbsorbing.bind(k12,data.k),
	K12.squeezing = k12._KangarooTwelve_IsSqueezing.bind(k12,data.k),

	K12.init();

	return K12;
}



const seeds = [];
function shuffleSeeder(salt){
  var val;
  if( seeds.length ) {
    //console.log( "using seed... ", seeds.length )
    salt.push( seeds.shift() );
  } else {
    salt.push(  ( val = new Date().getTime(), val =( val % 100000 ) * ( val % 100000 ) )  );
    // save seeds to rebuild stream later is possible...
    //if( outSeeds )
    //  outSeeds.write( String(val) + "\n");
  }
}

function Holder() {
  return {
    number : 0
    , r : 0
    , less : null
    , more : null
  };
}
var holders = [];

function sort(  tree,  number,  r )
{
    //console.log( "Assign ", r, " to ", number)
   if( !tree )
   {
      tree = holders.pop();
      if( !tree ) tree = Holder();
      tree.number = number;
      tree.r = r;
      tree.pLess = tree.pMore = null;
   }
   else
   {
      if( r > tree.r )
         tree.pMore = sort( tree.pMore, number, r );
      else
         tree.pLess = sort( tree.pLess, number, r );
   }
   return tree;
}
function  FoldTree( tree, numbers, count )
{
   if( !(count-numbers.length) ) return numbers;
   if( tree.pLess )
      FoldTree( tree.pLess, numbers, count );
   numbers.push(tree.number);
   holders.push(tree);
   if( tree.pMore )
      FoldTree( tree.pMore, numbers, count ); 
   return numbers
}

function  Shuffle( numbers, count, RNG )
{
	const bits = (Math.ceil(Math.log2( numbers.length ))+2 )|0;
	var tree;
	var n;
	tree = null;
	for( n of numbers )
		tree = sort( tree, n, RNG.getBits(bits) );//RNG.getBits( 13 ) );

	var x = FoldTree( tree, [], count||numbers.length );
	
	return x;
}

function Shuffler( opts ) {
	var RNG;
	if( opts && opts.salt ) {
		RNG = SaltyRNG( opts.salt, {mode:1} );
	}
	else 
		RNG = SaltyRNG( shuffleSeeder, {mode:1} );
	return {
		shuffle(numbers,count) {
			 return Shuffle(numbers,count, RNG);
		}
	};
}

SaltyRNG.Shuffler = Shuffler;

//----------------------------------------------------------------------------

const RNG= SaltyRNG( 
	(saltbuf)=>saltbuf.push( new Date().toISOString() ), { mode:1 } );
const RNG2 = SaltyRNG( getSalt2, { mode:1 } );


let salt = null;
function getSalt2 (saltbuf) {
    if( salt ) {
        saltbuf.push( salt );
        salt = null;
    }
}

SaltyRNG.id = function( s ) {
	if( s !== undefined ) {
		salt = s;
		RNG2.reset();
		// this is an ipv6 + UUID
		return base64ArrayBuffer$1( RNG2.getBuffer(8*(16+16)) );
	}
   	return base64ArrayBuffer$1( RNG.getBuffer(8*(16+16)) );
};

SaltyRNG.Id = function(s) {
    // this is an ipv6 + UUID
    let ID;
	if( s !== undefined ) {
		salt = s;
		RNG2.reset();
		// this is an ipv6 + UUID
		ID = RNG2.getBuffer(8*(12));
	}
	else {
    		ID = RNG.getBuffer(8*(12));
                // 1 second marker
	    const now = ( Date.now() / 1000 ) | 0;
	    ID[0] = ( now & 0xFF0000 ) >> 16;
	    ID[1] = ( now & 0x00FF00 ) >> 8;
	    ID[2] = ( now & 0x0000FF );
	}
    return base64ArrayBuffer$1( ID );
};

SaltyRNG.u16_id = function() {
    // this is an ipv6 + UUID
    var out = [];
    for( var c = 0; c < 25; c++ ) {
    	var ch = RNG.getBits( 10 ); if( ch < 32 ) ch |= 64;
    	out[c] = String.fromCodePoint( ch );
    }
    return out.join('');
};

function signCheck( buf ) {
		buf = new Uint8Array(buf);
		var n, b;
		var is0 = 0;
		var is1 = 0;
		var long0 = 0;
		var long1 = 0;
		var longest0 = 0;
		var longest1 = 0;
		var ones = 0;
		for( n = 0; n < 32; n++ ) {
			for( b = 0; b < 8; b++ ) {
				if( buf[n] & (1 << b) ) {
					ones++;
					if( is1 ) {
						long1++;
					}
					else {
						if( long0 > longest0 ) longest0 = long0;
						is1 = 1;
						is0 = 0;
						long1 = 1;
					}
				}
				else {
					if( is0 ) {
						long0++;
					}
					else {
						if( long1 > longest1 ) longest1 = long1;
						is0 = 1;
						is1 = 0;
						long0 = 1;
					}
				}
			}
		}
// 167-128 = 39 = 40+ dif == 30 bits in a row approx
//const overbal = (167-128)
		const overbal = (167-128);
                    //console.log( "result:", overbal, longest0, longest1, ones );
		if( longest0 > 29 || longest1 > 29 || ones > (128+overbal) || ones < (128-overbal) ) {
			return 1;
		}
		return 0;
	}

let signEntropy;
let nextSalt = new Uint8Array(32);
SaltyRNG.sign = function( msg ) {

		//SRGObject *obj = ObjectWrap::Unwrap<SRGObject>( args.This() );
		var id;
		//memcpy( nextSalt, *buf, buf.length() );
		if( !signEntropy ) {
			signEntropy = SaltyRNG( null, {mode:1} );
			signEntropy.initialEntropy = null;
		}

		do {
			signEntropy.reset();
			//console.log( "Feed message", msg );
			signEntropy.feed( msg );

			{
				id = SaltyRNG.id();
				DecodeBase64Into( nextSalt, id );
				signEntropy.feed( nextSalt );
				var bytes = signEntropy.getBuffer( 256 );
				if( signCheck( bytes ) ) ; else {
					id = null;
				}
			}
		} while( !id );
		return id;
		
};

SaltyRNG.verify = function( msg, id  ) {
		if( !signEntropy ) {
			signEntropy = SaltyRNG( null, {mode:1} );
			signEntropy.initialEntropy = null;
		}
		signEntropy.reset();
		//console.log( "Feed message.", msg );
		signEntropy.feed( msg );
		DecodeBase64Into( nextSalt, id );
		//console.log( "Feed ID", nextSalt, id );
		signEntropy.feed( nextSalt );
		var bytes = signEntropy.getBuffer( 256 );
		//console.log( "bytes:", new Uint8Array( bytes ) );
		return signCheck( bytes );
};


function base64ArrayBuffer$1(arrayBuffer) {
  var base64    = '';

  var bytes         = new Uint8Array(arrayBuffer);
  var byteLength    = bytes.byteLength;
  var byteRemainder = byteLength % 3;
  var mainLength    = byteLength - byteRemainder;

  var a, b, c, d;
  var chunk;
  //throw "who's using this?"
  //console.log( "buffer..", arrayBuffer )
  // Main loop deals with bytes in chunks of 3
  for (var i = 0; i < mainLength; i = i + 3) {
    // Combine the three bytes into a single integer
    chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

    // Use bitmasks to extract 6-bit segments from the triplet
    a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
    b = (chunk & 258048)   >> 12; // 258048   = (2^6 - 1) << 12
    c = (chunk & 4032)     >>  6; // 4032     = (2^6 - 1) << 6
    d = chunk & 63;               // 63       = 2^6 - 1

    // Convert the raw binary segments to the appropriate ASCII encoding
    base64 += encodings$1[a] + encodings$1[b] + encodings$1[c] + encodings$1[d];
  }

  // Deal with the remaining bytes and padding
  if (byteRemainder == 1) {
    chunk = bytes[mainLength];
    a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2
    // Set the 4 least significant bits to zero
    b = (chunk & 3)   << 4; // 3   = 2^2 - 1
    base64 += encodings$1[a] + encodings$1[b] + '==';
  } else if (byteRemainder == 2) {
    chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];
    a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
    b = (chunk & 1008)  >>  4; // 1008  = (2^6 - 1) << 4
    // Set the 2 least significant bits to zero
    c = (chunk & 15)    <<  2; // 15    = 2^4 - 1
    base64 += encodings$1[a] + encodings$1[b] + encodings$1[c] + '=';
  }
  //console.log( "dup?", base64)
  return base64
}


function DecodeBase64Into( out, buf ) {
	var outsize = 0;
	// if the buffer is truncated in length, use that as the 
	// constraint, and if 1 char results with 6 bits, do not
	// count that as a whole byte of output.
        if( !out ) {
		if( buf.length % 4 == 1 )
			outsize = (((buf.length + 3) / 4) * 3) - 3;
		else if( buf.length % 4 == 2 )
			outsize = (((buf.length + 3) / 4) * 3) - 2;
		else if( buf.length % 4 == 3 )
			outsize = (((buf.length + 3) / 4) * 3) - 1;
		else if( buf[buf.length - 1] == '=' ) {
			if( buf[buf.length - 2] == '=' )
				outsize = (((buf.length + 3) / 4) * 3) - 2;
			else
				outsize = (((buf.length + 3) / 4) * 3) - 1;
		}
		else
			outsize = (((buf.length + 3) / 4) * 3);
		out = new Uint8Array( outsize );
	}

	var n;
	var l = (buf.length+3)/4;
	for( n = 0; n < l; n++ )
	{
		var index0 = decodings$1[buf[n*4]];
		var index1 = decodings$1[buf[n*4+1]];
		var index2 = decodings$1[buf[n*4+2]];
		var index3 = decodings$1[buf[n*4+3]];
		
		out[n*3+0] = (( index0 ) << 2 | ( index1 ) >> 4);
		out[n*3+1] = (( index1 ) << 4 | ( ( ( index2 ) >> 2 ) & 0x0f ));
		out[n*3+2] = (( index2 ) << 6 | ( ( index3 ) & 0x3F ));
	}

	return out;
}

function DecodeBase64$1( buf )
{
    return DecodeBase64$1();
}


// Converts an ArrayBuffer directly to base64, without any intermediate 'convert to string then
// use window.btoa' step. According to my tests, this appears to be a faster approach:
// http://jsperf.com/encoding-xhr-image-data/5
// doesn't have to be reversable....



var xor_code_encodings = {};//'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
for( var a = 0; a < encodings$1.length; a++  ) {
   var r = (xor_code_encodings[encodings$1[a]]={} );
   for( var b = 0; b < encodings$1.length; b++  ) {
	r[encodings$1[b]] = encodings$1[a^b];
   }
}
xor_code_encodings['='] = {'=': '='};

function xor(a,b) {
  var c = "";
  for( var n = 0; n < a.length; n++ ) {
	c += xor_code_encodings[a[n]][b[n]];
  }
  return c
}
SaltyRNG.xor = xor;

function dexor(a,b,d,e) {
  var r = "";
  var n1 = (d-1)*((a.length/e)|0);
  var n2 = (d)*(a.length/e)|0;

  for( var n = 0; n < n1; n++ )
	r += a[n];
  for( ; n < n2; n++ )
	r += xor_code_encodings[a[n]][b[n]];
  for( ; n < n2; n++ )
	r += a[n];

  return r
}
SaltyRNG.dexor=dexor;

function txor(a,b) {
	const d = [...b].map( (c)=>c.codePointAt(0) );
	const keylen = d.length;
	return [...a].map( (c,n)=>String.fromCodePoint( c.codePointAt(0)^d[n%keylen] )).join("");
}
SaltyRNG.u16xor=txor;

function makeXKey( key, step ) {
    return { key : key, keybuf: key?base64ArrayBuffer$1(key):null, step: step?step:0
	, setKey(key,step) { this.key = key; this.keybuf = DecodeBase64Into( new Uint8Array(Math.ceil(key.length*3/4)), key); this.step = step?step:0; } };
}

function makeU16Key( ) {
    return SaltyRNG.u16generator();
}

SaltyRNG.xkey = makeXKey;
SaltyRNG.ukey = makeU16Key;


//   0x xx xx xx     7 bits
//   10 xx xx xx   0  continuation byte
//   mask 3f
//   11 0x xx xx   6  8-11 bits
//       X XX X_  0x1E  ( required bits )  0x1 allowed bits on first byte
//   11 10 xx xx   12  12-16 bits
//         XX XX   10 X_ __ __   required bits  0x1F (allowed bits on second)
//   11 11 0x xx   18  17-21 bits
//          X XX   10 XX __ __   0xF (allowed bits on second)
//   11 11 10 xx   24  22-26 bits
//            XX   10 XX X_ __   0x7 (allowed bits on second byte)
//   11 11 11 0x   30  27-31 bits
//             X   10 XX XX __  0x3 (allowed bits on second byte)


function u8xor(a,b) {
	let buf = Buffer.from(a, 'utf8');
	if( !b.keybuf ) { /*console.trace( "Key needs buf...." );*/ b.keybuf = Buffer.from( b.key, 'utf8' ); }
	let c = b.keybuf;//Buffer.from(b.key, 'utf8');
	//var buf = TE.encode(a);
	let outBuf = new Buffer.alloc( buf.length );
	let o = b.step;
	b.step += buf.length;
	let keylen = b.key.length-5;
	b.step %= keylen;
	let _mask = 0x3F;
	let l = 0;
        //console.log( "Decode length:", buf.length );
	for( var n = 0; n < buf.length; n++ ) {
		let v = buf[n];
		let mask = _mask;

		if( (v & 0x80) == 0x00 )      { if( l ) throw new Error( "short utf8 sequence found" ); mask=0x3f; _mask = 0x3f; }
		else if( (v & 0xC0) == 0x80 ) { if( !l ) throw new Error( "invalid utf8 sequence" ); l--; _mask = 0x3f; }
		else if( (v & 0xE0) == 0xC0 ) { if( l ) throw new Error( "short utf8 sequence found" ); l = 1; mask=0x1;_mask = 0x3f; }  // 6 + 1 == 7
		else if( (v & 0xF0) == 0xE0 ) { if( l ) throw new Error( "short utf8 sequence found" ); l = 2; mask=0;  _mask = 0x1f; }  // 6 + 5 + 0 == 11 
		else if( (v & 0xF8) == 0xF0 ) { if( l ) throw new Error( "short utf8 sequence found" ); l = 3; mask=0;  _mask = 0x0f; }  // 6(2) + 4 + 0 == 16
		else if( (v & 0xFC) == 0xF8 ) { if( l ) throw new Error( "short utf8 sequence found" ); l = 4; mask=0;  _mask = 0x07; }  // 6(3) + 3 + 0 == 21
		else if( (v & 0xFE) == 0xFC ) { if( l ) throw new Error( "short utf8 sequence found" ); l = 5; mask=0;  _mask = 0x03; }  // 6(4) + 2 + 0 == 26

		if( mask )
			outBuf[n] = (v & ~mask ) | ( u8xor_code_encodings2[ ((v & mask)<<7) + (c[(n+o)%(keylen)]) ] & mask );
		else
			outBuf[n] = v;
	}
	return outBuf.toString( "utf8" );
}
SaltyRNG.u8xor = u8xor;

Object.freeze( SaltyRNG );

const short_generator = SaltyRNG.Id;

const connections = new Map();

function makeProtocol( client ) {

	function send(msg) {
	    client.postMessage( msg );
	}

	function handleServiceMessage(e,msg) {
		//const msg = e.data;
		if( "string" === typeof msg ) {
			console.log( "String message??", msg );
			//return wsAuth.send( msg );
		}
                //console.log( "Worker received from main:", msg );
                if( msg.op === "connect" ) {
                	const connection = makeSocket();
			protocol_.connectionId = connection.id;
	        
			e.source.postMessage( {op:"connecting", id:connection.id } );
	        
			connection.ws = protocol.connect( msg.address, msg.protocol, 
				(msg)=>e.source.postMessage({op:"b",id:connection.id,msg:msg })
			);
			
		}else if( msg.op === "connected" ) {
			const socket = connections.get( msg.id );
		}else if( msg.op === "send" ) {
			const socket = connections.get( msg.id );
			if( socket ) socket.ws.send( msg.msg );
			//else throw new Error( "Socket to send to is closed:"+msg.id );
		}else if( msg.op === "close" ) {
			const socket = connections.get( msg.id );
			if( socket ) socket.ws.close();
			//else throw new Error( "Socket to close to is closed:"+msg.id );
                }else if( msg.op === "serviceReply" ) {
			const newSock = makeSocket();
			protocol_.connectionId = newSock.id;
					        		
			newSock.ws = openSocket( msg.service, (msg,ws)=>{
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
		connect : connect,
		//login : login,
		connectTo : connectTo,
		handleServiceMessage : handleServiceMessage,
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
		return openSocket( proto, cb, null, addr );
	}


	function makeSocket( ) {
		const sock = {
				ws : null, // wait until we get a config to actually something...
				id : short_generator()
			};
		connections.set( sock.id, sock );
		return sock;
	}


	function openSocket( protocol, cb, conId, peer ) {
		let ws;

		cb( { op:"status", status:"connecting..." + " " + protocol } );

		ws = new WebSocket( peer, protocol );
		//console.log( "New connection ID:", protocol_.connectionId );
		
		ws.id = protocol_.connectionId;
		protocol_.connectionId = null;
	        
		cb( { op:"opening", ws:ws.id } );

                //console.log( "Got websocket:", ws, Object.getPrototypeOf( ws ) );
		ws.onopen = function() {
			cb( { op:"open", status: "Opened...." }, ws);
		};
		ws.onmessage = function handleSockMessage(evt) {
			const msg_ = evt.data;
			if( msg_[0] === '\0' ) {
				const msg = JSOX.parse( msg_.substr(1) ); // kinda hate double-parsing this... 
				if( msg.op === 'GET' ) {
					if( protocol_.resourceReply )
						protocol_.resourceReply( client, msg );
					return;
				}
			} else
				send( {op:'a', id:ws.id, msg:msg_ } ); // just forward this.
		};
		ws.onclose = doClose;
		function doClose(status) {
	        
			if( protocol.serviceLocal ) {
				if( protocol.serviceLocal.uiSocket === ws.socket ) {
                                    	console.log( "clearing ui Socket so it doesn't send?" );
					protocol.serviceLocal.uiSocket = null;
                                }
			}
	        
			connections.delete( ws.id );
			console.log(" Connection closed...", status, ws.id );
	        
			cb( { op:"status", status: "Disconnected... waiting a moment to reconnect..." }, ws);
			cb( { op:"disconnect", id:ws.id }, ws );
                	// websocket is closed.
		}		return ws;
	}

	function connectTo( addr, service, sid, cb ) {
		openSocket( service, cb, sid, addr );
	}


	return protocol;

}

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
                    console.log( "Client is not found... not a valid channel.", clientId, self.clients );
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
        console.log("HAndle message: (to get client)", msg );
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
			console.log( "Failed to find the requested request" + event.data );
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
	            client.protocol.handleServiceMessage( event, msg );
	}
}
