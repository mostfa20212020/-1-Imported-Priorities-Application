/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-5d155c7a'], (function (workbox) { 'use strict';

  importScripts("/sw-sync.js");
  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "sw-sync.js",
    "revision": "d3acb8d1f8bd673a9891cd840adc5b50"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "312f4072b120cc43c9b79bbd47dbf58a"
  }, {
    "url": "pwa-512x512.png",
    "revision": "84023b07de0d485f0eb0555b5e8e7e82"
  }, {
    "url": "pwa-192x192.png",
    "revision": "21be8c34ce7b8cf7925ada2802f74a9a"
  }, {
    "url": "index.html",
    "revision": "948fc3017c4f1e71f6e4a040b6519bec"
  }, {
    "url": "icon.svg",
    "revision": "9d4c6ee3f7a8cf0544fabc3050bacf2e"
  }, {
    "url": "favicon.ico",
    "revision": "f48b1217a34558a49649a6de323e0757"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "e441f59754e0846138fb69f6e1e9fb6d"
  }, {
    "url": "assets/index-jFlW371N.js",
    "revision": null
  }, {
    "url": "assets/index-K4bqjSAX.css",
    "revision": null
  }, {
    "url": "__manus__/debug-collector.js",
    "revision": "4a1f47d778978911d4a79e0d865772e2"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "e441f59754e0846138fb69f6e1e9fb6d"
  }, {
    "url": "favicon.ico",
    "revision": "f48b1217a34558a49649a6de323e0757"
  }, {
    "url": "icon.svg",
    "revision": "9d4c6ee3f7a8cf0544fabc3050bacf2e"
  }, {
    "url": "pwa-192x192.png",
    "revision": "21be8c34ce7b8cf7925ada2802f74a9a"
  }, {
    "url": "pwa-512x512.png",
    "revision": "84023b07de0d485f0eb0555b5e8e7e82"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "312f4072b120cc43c9b79bbd47dbf58a"
  }, {
    "url": "sw-sync.js",
    "revision": "d3acb8d1f8bd673a9891cd840adc5b50"
  }, {
    "url": "manifest.webmanifest",
    "revision": "21897a73f1271f44827cf616dbd65b1c"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-stylesheets",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-webfonts",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 30,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/\/api\/trpc\/.*/i, new workbox.NetworkFirst({
    "cacheName": "api-core-data-cache",
    "networkTimeoutSeconds": 3,
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 200,
      maxAgeSeconds: 86400
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/\/api\/.*/i, new workbox.NetworkFirst({
    "cacheName": "api-endpoints-cache",
    "networkTimeoutSeconds": 4,
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: 86400
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
