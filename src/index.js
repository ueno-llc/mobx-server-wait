import { autorun, toJS, map } from 'mobx';
import { fromPromise } from 'mobx-utils';
import ReactDOMServer from 'react-dom/server';
import stringify from 'json-stringify-safe';
import _once from 'lodash/once';
import _debounce from 'lodash/debounce';
import _isFunction from 'lodash/isFunction';
import _get from 'lodash/get';

// Promises container
export const promises = map();

/**
 * ServerWait decorator function
 * @param {object} Configuration
 * @return {void}
 */
const serverWaitProxy = ({ maxWait, retryRejected }) =>
  function serverWaitMethod(target, name, descriptor) {
    // Get and store provided method
    const method = descriptor.value;

    // Overwrite method to capture returned promise
    descriptor.value = function serverWaitMethod(...args) { // eslint-disable-line

      // Create re-usable key from classname or class displayName
      // And the corresponding action name
      const constr = target.constructor;
      const keyFnArgs = stringify(args)
        .replace(/^\[/, '(')
        .replace(/\]$/, ')')
        .replace(/^\(\)$/, '');
      const key = `${constr.displayName || constr.name}.${name}${keyFnArgs}`;

      // Check if promises don't include current key
      if (!promises.has(key)) {
        // Add the promise and given options to the promise map
        promises.set(key, {
          promise: fromPromise(method.apply(this, args)),
          maxWait,
          client: (typeof window !== 'undefined'),
        });
      } else if (typeof window !== 'undefined') {
        const item = promises.get(key);
        const { state } = item.promise;

        // Check if server gave pending state
        // Or rejected and it's allowed to continue after rejection.
        if (state === 'pending' || (retryRejected && state === 'rejected') || item.client) {
          method.apply(this, args);
        }

        // Now i'm client.
        item.client = true;
      }

      return this;
    };
  };

export default function serverWait(...props) {
  // Check if decorator applied as `serverWait` or `serverWait()`.
  const hasDescriptor = props.find(arg => _isFunction(_get(arg, 'value')));

  // Default decorator options
  const defaults = {
    maxWait: -1,
    retryRejected: false,
  };

  if (!hasDescriptor) {
    // Return a function to execute
    return serverWaitProxy(props[0] || defaults);
  }

  // Execute
  return serverWaitProxy(defaults)(...props);
}

/**
 * This method fills the promises array with data
 * @param {object} List of promises
 */
export function fillServerWait(obj, key = 'serverWaitPromises') {
  // Use the mobx's map merge method.
  promises.merge((obj && obj[key]) || {});
}

/**
 * Render given react root every time the promise chain changes.
 * @param {object} List of params needed for rendering
 * @return {function} Callback function to render the app
 */
export function serverWaitRender({
  store = {},
  maxWait = 1250,
  root,
  render = (() => {}),
  debug = (() => {}),
  storeKey = 'serverWaitPromises',
}) {
  const req = {
    cancel: () => {},
    timers: new Map(),
    start: process.hrtime(),
  };

  // Clear the promises map on every request.
  promises.clear();

  // Final render method
  // Only callable once
  const renderOnce = _once(() => {
    // Cancel previous listeners
    req.cancel();

    // Add current state of promises to the store
    // TODO: This needs to be configurable.
    store[storeKey] = promises; // eslint-disable-line

    // Get total time of render
    const [s, ns] = process.hrtime(req.start);
    const ms = (ns / 1000000) + (s * 1000);
    debug('rendered in %s', `${ms.toFixed(3)}ms`);

    // Execute the callback render method with root and store as arguments
    render(ReactDOMServer.renderToString(root), stringify(toJS(store)));
  });

  // 50ms should be enough computing time between mobx events.
  const debouncedRender = _debounce(renderOnce, 50);

  const step = () => {

    // Cancel last called render
    debouncedRender.cancel();

    // Find all promise entries
    const pending = promises
    .entries()
    .filter(([key, { promise, maxWait }]) => { // eslint-disable-line

      // Check this entry already encountered in one of the previous steps
      if (!req.timers.has(key) && promise.state === 'pending') {

        // Add promise and pointer to cancel the promise on max wait timeout.
        req.timers.set(key, {
          ms: process.hrtime(),
          cancel: (maxWait) > 0 ? setTimeout(step, maxWait) : null,
        });

        debug(`${key}:`, 'pending', maxWait > 0 ? `(<${maxWait}ms)` : '');
      }

      if (req.timers.has(key)) {

        // Find duration since started
        const p = req.timers.get(key);
        const [s, ns] = process.hrtime(p.ms);
        const ms = (ns / 1000000) + (s * 1000);

        // Cancel this promise if over the max wait time
        if (ms > maxWait && maxWait !== -1) {
          debug(`${key}:`, 'cancelled');
          return false;
        }

        if (promise.state !== 'pending') {
          // The promise has been resolved.
          // Render to allow side-effects to occour.
          ReactDOMServer.renderToString(root);

          debug(`${key}:`, promise.state, `(${ms.toFixed(3)}ms)`);

          // Collect and trash
          clearTimeout(p.cancel);
          req.timers.delete(key);
        }
      }

      return (promise.state === 'pending');
    });

    if (pending.length === 0) {
      debouncedRender();
    }
  };

  // Kickstart rendering
  ReactDOMServer.renderToString(root);

  // Run the step function on every change in promises map
  const cancelAutorunner = autorun(step);

  // Force render after maximum wait time.
  const timeoutRender = setTimeout(renderOnce, maxWait);

  // Create cancellable handler
  req.cancel = () => {
    cancelAutorunner();
    clearTimeout(timeoutRender);
    debouncedRender.cancel();
  };

  // Return cancel handler to be used on closed connections
  return req.cancel;
}
