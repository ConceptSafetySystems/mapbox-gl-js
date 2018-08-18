// @flow

import { normalizeGlyphsURL } from '../util/mapbox';

import { getArrayBuffer, ResourceType } from '../util/ajax';
import parseGlyphPBF from './parse_glyph_pbf';

import type {StyleGlyph} from './style_glyph';
import type {RequestTransformFunction} from '../ui/map';
import type {Callback} from '../types/callback';
import gzip from 'gzip-js'

export default function (fontstack: string,
                           range: number,
                           urlTemplate: string,
                           requestTransform: RequestTransformFunction,
                           callback: Callback<{[number]: StyleGlyph | null}>) {
    const begin = range * 256;
    const end = begin + 255;

    const request = requestTransform(
        normalizeGlyphsURL(urlTemplate)
            .replace('{fontstack}', fontstack)
            .replace('{range}', `${begin}-${end}`),
        ResourceType.Glyphs);

    getArrayBuffer(request, (err, response) => {
        if (err) {
            callback(err);
        } else if (response) {
            try {
                //console.log(request);
                //console.log(response.data.byteLength);
                //console.log(response.data[0]);
                let output = gzip.unzip(new Uint8Array(response.data));
                //console.dir(output);
                response.data = output;
            } catch (err) {
                //console.log("glyph gunzip failed: " + err)
            }
            const glyphs = {};

            for (const glyph of parseGlyphPBF(response.data)) {
                glyphs[glyph.id] = glyph;
            }

            callback(null, glyphs);
        }
    });
}
