import type {VideoSpec} from './common';
// Canvas choices are a product policy within the reviewed API contract. Old
// snapshots are retained verbatim until the user explicitly selects a new value.
export function canvasVideoSpecs<T extends VideoSpec>(specs:T[]):T[]{
 return specs.filter(spec=>Number.isInteger(spec.durationSeconds)&&spec.durationSeconds!>=5&&spec.durationSeconds!<=15&&['480p','720p'].includes(spec.resolution?.toLowerCase()??''));
}
