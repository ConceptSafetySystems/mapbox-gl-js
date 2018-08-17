## Purpose
This fork of Mapbox GL is a small experiment to allow for downloading a remote [MBtiles](https://github.com/mapbox/mbtiles-spec) file and using it as a local vector tile source.

MBtiles is basically just an SQlite database with all of the map tiles contained within it. 

The main reason for wanting to do this was so that we could develop an offline (PWA style) mapping application without needing to individiually store some 30K+ tile files.

At scale there would definitely be some memory implications because the SQLite db is kept in memory, but for this experiment's purposes it should work fine since it'll only be about a 30MB file.

## SQL.JS Work-around
* https://github.com/kripken/sql.js/
* https://raw.githubusercontent.com/kripken/sql.js/master/js/sql.js
Unfortunately there's some weird issue with directly building the source with SQL.js included in the project. It causes out of memory failures in the build process, and even if you work-around that, it gets stuck in an infinite loop. In short it wasn't worth fixing at this time, and so instead you just have to directly include sql.js in the front-end code.

## Demo example
See the example in [demo-mbtiles]. You'll need to update some of the hard-coded URLs for it to work in your environment. Make sure to search for 'localhost' in omt.style.json and metadata.json.

## Docs
See the original Mapbox GL JS Github for full documentation [https://github.com/mapbox/mapbox-gl-js]

See [CONTRIBUTING.md] for development instructions, or in very short for development:
```bash
yarn install
yarn run start-debug
```

Then to create the production dist files:
```bash
yarn build-min
```

## License

Mapbox GL JS is licensed under the [3-Clause BSD license](https://github.com/mapbox/mapbox-gl-js/blob/master/LICENSE.txt).
The licenses of its dependencies are tracked via [FOSSA](https://app.fossa.io/projects/git%2Bhttps%3A%2F%2Fgithub.com%2Fmapbox%2Fmapbox-gl-js):

[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bhttps%3A%2F%2Fgithub.com%2Fmapbox%2Fmapbox-gl-js.svg?type=large)](https://app.fossa.io/projects/git%2Bhttps%3A%2F%2Fgithub.com%2Fmapbox%2Fmapbox-gl-js?ref=badge_large)
