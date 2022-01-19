const {Soup, Gio, GLib, Secret} = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const TOKEN_SCHEMA = Secret.Schema.new("org.gnome.hass-data.Password",
	Secret.SchemaFlags.NONE,
	{
		"token_string": Secret.SchemaAttributeType.STRING,
	}
);

/**
 *
 * @param {String} type Request type.
 * @param {String} url Url of the request.
 * @param {Object} data Data in json format.
 * @return {Soup.Message} A soup message with the requested parameters.
 */
function _constructMessage(type, url, data=null) {
    // Initialize message and set the required headers
    let message = Soup.Message.new(type, url);
    message.request_headers.append(
      'Authorization',
      `Bearer ${Secret.password_lookup_sync(TOKEN_SCHEMA, {"token_string": "user_token"}, null)}`
    )
    if (data !== null){
        // Set body data: Should be in json format, e.g. '{"entity_id": "switch.some_relay"}'
        // TODO: Maybe perform a check here
        message.set_request('application/json', 2, data);
    }
    message.request_headers.set_content_type("application/json", null);
    return message
}

/**
 *
 * @param {String} url The url which you want to 'ping'
 * @param {String} type Request type (e.g. 'GET', 'POST')
 * @param {Object} data (optional) Data that you want to send with the request (must be in json format)
 * @return {Object} The response of the request (returns false if the request was unsuccessful)
 */
function send_request(url, type='GET', data=null) {
    // Initialize session
    let session = Soup.Session.new();
    session.set_property(Soup.SESSION_TIMEOUT, 3);
    session.set_property(Soup.SESSION_USER_AGENT, "hass-gshell");

    // Initialize message and set the required headers
    let message = _constructMessage(type, url, data);
    let responseCode = session.send_message(message);
    if (responseCode == Soup.Status.OK) {
        try {
            return JSON.parse(message['response-body'].data);
        } catch(error) {
            logError(error, `Could not send request to ${url}.`);
        }
    }
    return false;
}

/**
 *
 * @param {String} base_url The base url of the Home Assistant instance
 * @return {Object} Array of dictionaries with 'entity_id' and 'name' entries
 */
function discoverSwitches(base_url) {
    let url = `${base_url}api/states`
    let data = send_request(url, 'GET');
    if (data === false) {
        return [];
    }
    let entities = [];
    for (let ent of data) {
        // Save all the switchable/togglable entities in the entities array
        if (ent.entity_id.startsWith('switch.') || ent.entity_id.startsWith('light.')) {
            entities.push(
              {
                'entity_id': ent.entity_id,
                'name': ent.attributes.friendly_name
              }
            )
        }
    }
    return entities
}

/**
 *
 * @param {String} base_url The base url of the Home Assistant instance
 * @return {Object} Array of dictionaries with 'entity_id' and 'name' entries
 */
function discoverSensors(base_url) {
    let url = `${base_url}api/states`
    let data = send_request(url, 'GET');
    if (data === false) {
        return [];
    }
    let entities = [];
    for (let ent of data) {
        // Save all the switchable/togglable entities in the entities array
        if (ent.entity_id.startsWith('sensor.')) {
            if (!ent.state || !ent.attributes.unit_of_measurement){
                continue
            }
            if (ent.state === "unknown" || ent.state === "unavailable"){
                continue
            }
            entities.push(
              {
                'entity_id': ent.entity_id,
                'name': ent.attributes.friendly_name,
                'unit': ent.attributes.unit_of_measurement
              }
            )
        }
    }
    return entities
}

/**
 * Check equality of elements of two arrays
 * @param {Array} a Array 1
 * @param {Array} b Array 2
 * @return {boolean} true if the two arrays have the same elements. false otherwise.
 */
function arraysEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;

    // If you don't care about the order of the elements inside
    // the array, you should sort both arrays here.
    // Please note that calling sort on an array will modify that array.
    // you might want to clone your array first.

    for (var i = 0; i < a.length; ++i) {
      if (a[i] !== b[i]) return false;
    }
    return true;
}

// // Credits: https://stackoverflow.com/questions/65830466/gnome-shell-extension-send-request-with-authorization-bearer-headers/65841700
// function send_request(url, type='GET', data=null) {
//   let message = Soup.Message.new(type, url);
//   message.request_headers.append(
//     'Authorization',
//     `Bearer ${Secret.password_lookup_sync(TOKEN_SCHEMA, {"token_string": "user_token"}, null)}`
//   )
//   if (data !== null){
//     // Set body data: Should be in json format, e.g. '{"entity_id": "switch.some_relay"}'
//     // TODO: Maybe perform a check here
//     message.set_request('application/json', 2, data);
//   }
//   message.request_headers.set_content_type("application/json", null);
//   let output = false;
//   var soupSession = new Soup.Session();
//   soupSession.queue_message(message, (sess, msg) => {
//     if (msg.status_code == 200) {
//       try {
//         output = JSON.parse(msg['response-body'].data);
//       } catch(error) {
//         logError(error, "Could not send GET request to " + url);
//       }
//     }
//   });
//   return output;
// }

const getMethods = (obj) => {
  let properties = new Set()
  let currentObj = obj
  do {
    Object.getOwnPropertyNames(currentObj).map(item => properties.add(item))
  } while ((currentObj = Object.getPrototypeOf(currentObj)))
  return [...properties.keys()].filter(item => typeof obj[item] === 'function')
}
