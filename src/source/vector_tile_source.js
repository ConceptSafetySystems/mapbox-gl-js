// @flow

import { Event, ErrorEvent, Evented } from '../util/evented';

import { extend, pick } from '../util/util';
import loadTileJSON from './load_tilejson';
import { normalizeTileURL as normalizeURL } from '../util/mapbox';
import TileBounds from './tile_bounds';
import { ResourceType } from '../util/ajax';
import browser from '../util/browser';

import type { Source } from './source';
import type { OverscaledTileID } from './tile_id';
import type Map from '../ui/map';
import type Dispatcher from '../util/dispatcher';
import type Tile from './tile';
import type { Callback } from '../types/callback';
import type { Cancelable } from '../types/cancelable';
import gzip from 'gzip-js'

class VectorTileSource extends Evented implements Source {
    type: 'vector';
    id: string;
    minzoom: number;
    maxzoom: number;
    url: string;
    scheme: string;
    tileSize: number;

    _options: VectorSourceSpecification;
    _collectResourceTiming: boolean;
    dispatcher: Dispatcher;
    map: Map;
    bounds: ?[number, number, number, number];
    tiles: Array<string>;
    tileBounds: TileBounds;
    reparseOverscaled: boolean;
    isTileClipped: boolean;
    _tileJSONRequest: ?Cancelable;
    mbTilesDb: Uint8Array;

    constructor(id: string, options: VectorSourceSpecification & { collectResourceTiming: boolean }, dispatcher: Dispatcher, eventedParent: Evented) {
        super();
        this.id = id;
        this.dispatcher = dispatcher;

        this.type = 'vector';
        this.minzoom = 0;
        this.maxzoom = 22;
        this.scheme = 'xyz';
        this.tileSize = 512;
        this.reparseOverscaled = true;
        this.isTileClipped = true;

        this.mbTilesDb = null;

        extend(this, pick(options, ['url', 'scheme', 'tileSize']));
        this._options = extend({ type: 'vector' }, options);

        this._collectResourceTiming = options.collectResourceTiming;

        if (this.tileSize !== 512) {
            throw new Error('vector tile sources must have a tileSize of 512');
        }

        this.setEventedParent(eventedParent);
    }

    isMbtilesSource(tileJSON) {
        return (typeof tileJSON.tiles[0] !== "undefined" && tileJSON.tiles[0].indexOf("mbtiles") !== -1);
    }

    getUrlFromMbtiles(tileUrl) {
        // Expects a URL format like http://localhost/mbtile/countries.mbtiles?{z}/{x}/{y}
        return tileUrl.substring(0, tileUrl.indexOf('?'));
    }

    getZXYFromMbtiles(tileUrl) {
        // Expects a URL format like http://localhost/mbtile/countries.mbtiles?{z}/{x}/{y}
        // Get an array [z,x,y] from the URL
        const zxy = tileUrl.substring(tileUrl.indexOf('?') + 1).split("/");
        // console.log("getZXYFromMbtiles", zxy);
        return zxy;
    }

    getTileFromMbtiles(tileUrl) {
        let [z, x, y] = this.getZXYFromMbtiles(tileUrl);
        const data = null;

        //var contents = db.exec("SELECT name FROM sqlite_master WHERE type='table';");
        //console.dir(contents);
        y = (1 << z) - 1 - y;

        // console.log(`getTileFromMbtiles: ${z}/${x}/${y}`);

        // const res = this.mbTilesDb.exec(`SELECT tile_data FROM tiles WHERE zoom_level = 14 AND tile_column = 15148 AND tile_row = 6888`);
        const res = this.mbTilesDb.exec(`SELECT tile_data FROM tiles WHERE zoom_level = ${z} AND tile_column = ${x} AND tile_row = ${y}`);
        if (res.length == 0) {
            console.log("getTileFromMbtiles: no data")
            return null;
        }

        // console.log("getTileFromMbtiles: raw tileData:", res[0].values[0]);

        let tileData = res[0].values[0][0];

        let output = null;
        try {
            output = gzip.unzip(tileData);
            // console.log("getTileFromMbtiles: inflated tileData:", output);
        } catch (err) {
            console.log("gunzip failed: " + err)

            // return the raw tile data - it's possible it just wasn't gzip'd
            return tileData;
        }

        return output;
    }

    load() {
        this.fire(new Event('dataloading', { dataType: 'source' }));
        this._tileJSONRequest = loadTileJSON(this._options, this.map._transformRequest, (err, tileJSON) => {
            this._tileJSONRequest = null;
            if (err) {
                this.fire(new ErrorEvent(err));
            } else if (tileJSON) {
                const loaded = () => {
                    extend(this, tileJSON);
                    if (tileJSON.bounds) this.tileBounds = new TileBounds(tileJSON.bounds, this.minzoom, this.maxzoom);

                    // `content` is included here to prevent a race condition where `Style#_updateSources` is called
                    // before the TileJSON arrives. this makes sure the tiles needed are loaded once TileJSON arrives
                    // ref: https://github.com/mapbox/mapbox-gl-js/pull/4347#discussion_r104418088
                    this.fire(new Event('data', { dataType: 'source', sourceDataType: 'metadata' }));
                    this.fire(new Event('data', { dataType: 'source', sourceDataType: 'content' }));
                }

                // Check if the tile source is a single mbtiles file, then pre-load the database
                if (this.isMbtilesSource(tileJSON)) {
                    // console.log("loading mbtiles file: " + tileJSON.tiles[0]);
                    const mbtilesUrl = this.getUrlFromMbtiles(tileJSON.tiles[0]);
                    // console.log("URL only", mbtilesUrl);
                    let xhr = new XMLHttpRequest();
                    xhr.open('GET', mbtilesUrl, true);
                    xhr.responseType = 'arraybuffer';

                    xhr.onload = e => {
                        // console.log("got db");
                        const uInt8Array = new Uint8Array(xhr.response);
                        this.mbTilesDb = new SQL.Database(uInt8Array);
                        loaded();
                    };
                    xhr.send();
                } else {
                    loaded();
                }
            }
        });
    }

    hasTile(tileID: OverscaledTileID) {
        return !this.tileBounds || this.tileBounds.contains(tileID.canonical);
    }

    onAdd(map: Map) {
        this.map = map;
        this.load();
    }

    onRemove() {
        if (this._tileJSONRequest) {
            this._tileJSONRequest.cancel();
            this._tileJSONRequest = null;
        }
    }

    serialize() {
        return extend({}, this._options);
    }

    loadTile(tile: Tile, callback: Callback<void>) {
        const url = normalizeURL(tile.tileID.canonical.url(this.tiles, this.scheme), this.url);
        // console.log("loadTile: " + url);
        const params = {
            request: this.map._transformRequest(url, ResourceType.Tile),
            uid: tile.uid,
            tileID: tile.tileID,
            zoom: tile.tileID.overscaledZ,
            tileSize: this.tileSize * tile.tileID.overscaleFactor(),
            type: this.type,
            source: this.id,
            pixelRatio: browser.devicePixelRatio,
            showCollisionBoxes: this.map.showCollisionBoxes,
            tileData: null,
            mbTiles: false
        };
        params.request.collectResourceTiming = this._collectResourceTiming;

        if (this.mbTilesDb !== null) {
            params.tileData = this.getTileFromMbtiles(url);
            params.mbTiles = true;
        }

        if (tile.workerID === undefined || tile.state === 'expired') {
            tile.workerID = this.dispatcher.send('loadTile', params, done.bind(this));
        } else if (tile.state === 'loading') {
            // schedule tile reloading after it has been loaded
            tile.reloadCallback = callback;
        } else {
            this.dispatcher.send('reloadTile', params, done.bind(this), tile.workerID);
        }

        function done(err, data) {
            if (tile.aborted)
                return callback(null);

            if (err && err.status !== 404) {
                return callback(err);
            }

            if (data && data.resourceTiming)
                tile.resourceTiming = data.resourceTiming;

            if (this.map._refreshExpiredTiles && data) tile.setExpiryData(data);
            tile.loadVectorData(data, this.map.painter);

            callback(null);

            if (tile.reloadCallback) {
                this.loadTile(tile, tile.reloadCallback);
                tile.reloadCallback = null;
            }
        }
    }

    abortTile(tile: Tile) {
        this.dispatcher.send('abortTile', { uid: tile.uid, type: this.type, source: this.id }, undefined, tile.workerID);
    }

    unloadTile(tile: Tile) {
        tile.unloadVectorData();
        this.dispatcher.send('removeTile', { uid: tile.uid, type: this.type, source: this.id }, undefined, tile.workerID);
    }

    hasTransition() {
        return false;
    }
}

export default VectorTileSource;
