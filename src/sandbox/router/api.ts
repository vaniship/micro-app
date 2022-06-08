import type { Router } from '@micro-app/types'
import {
  encodeMicroPath,
  decodeMicroPath,
} from './core'

// function push (to: {
//   name: string,
//   path: string,
//   state?: unknown,
//   replace?: boolean
// }) {

// }

// Router API for developer
export const router: Router = {
  currentRoute: {},
  encode: encodeMicroPath,
  decode: decodeMicroPath,
  // push,
  // replace:
  // go:
  // back:
  // forward:
  // beforeEach:
  // afterEach:
  // onError:
}
