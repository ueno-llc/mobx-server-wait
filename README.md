# mobx-server-wait
Render universally with server wait mobx actions.


## Install

```bash
npm install --save mobx-server-wait
```

## Usage in `store.js`:

```js
import { observable, extendObservable, action } from 'mobx';
import serverWait, { fillServerWait } from 'mobx-server-wait';
import fetch from 'isomorphic-fetch';

class Store {

  constructor(state = {}) {
    extendObservable(this, state);
    fillServerWait(state, 'serverWaitKeyToUse');
  }

  @observable
  planets = {
    isLoading: false,
    data: [],
  };

  @serverWait
  fetchPlanets() {
    this.planets.isLoading = true;
    const data = fetch('https://swapi.co/api/planets')
    .then(res => res.json());
    .then(action(data => {
      this.planets.isLoading = false;
      this.planets.data = data.results;
    }));
  }
}
```

## Usage in `server.js`:

```js
import express from 'express';
import { serverWaitRender } from 'mobx-server-wait';
import store from './store.js';


// Assuming you've created your server with express
app.get('*', (req, res) => {

  const store = new Store();

  const root = (
    <Provider planets={store}>
      <App />
    </Provider>
  );

  const render = (html, store) => res.send(`
    <!doctype html>
    <html>
      <body>
        <div id="root">${html}</div>
        <script>window.__STATE__ = ${store};</script>
        <script src="/bundle.js"></script>
      </body>
    </html>
  `);

  const storeKey = 'serverWaitKeyToUse';

  serverWaitRender({ store, storeKey, root, render });
});
```

## Options for @serverWait
```js
{
  // Maximum wait time for individual action
  maxWait: <Number> || -1,

  // Retry rejected promise actions on the client
  retryRejected: <Boolean> || false,
}
```

## Options for serverWaitRender
```js
{
  // Maximum waiting time until the server calls the render method.
  maxWait: <Number> || 1250,

  // Attach debugger like debug: (...args) => console.log(...args);
  debug: <Function> || undefined,

  // React component as root
  root: <React.Component> || undefined,

  // The mobx root store
  store: <Object> || {},

  // Render method
  render: <Function> || (html, state) => {},

  // Unique key to store promises map
  storeKey: <String> || 'serverWaitPromieses',
}
```

## Licence
MIT
