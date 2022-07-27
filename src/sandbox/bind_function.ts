/* eslint-disable no-return-assign */
import {
  isBoundFunction,
  isConstructor,
  rawDefineProperty,
  isBoolean,
} from '../libs/utils'

function isBoundedFunction (value: CallableFunction & {__MICRO_APP_IS_BOUND_FUNCTION__: boolean}): boolean {
  if (isBoolean(value.__MICRO_APP_IS_BOUND_FUNCTION__)) return value.__MICRO_APP_IS_BOUND_FUNCTION__
  return value.__MICRO_APP_IS_BOUND_FUNCTION__ = isBoundFunction(value)
}

function isConstructorFunction (value: FunctionConstructor & {__MICRO_APP_IS_CONSTRUCTOR__: boolean}) {
  if (isBoolean(value.__MICRO_APP_IS_CONSTRUCTOR__)) return value.__MICRO_APP_IS_CONSTRUCTOR__
  return value.__MICRO_APP_IS_CONSTRUCTOR__ = isConstructor(value)
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export default function bindFunctionToRawObject<T = Window> (rawObject: T, value: any, key = 'WINDOW'): unknown {
  const cacheKey = `__MICRO_APP_BOUND_${key}_FUNCTION__`
  if (value[cacheKey]) return value[cacheKey]

  if (!isConstructorFunction(value) && !isBoundedFunction(value)) {
    const bindRawObjectValue = value.bind(rawObject)

    for (const key in value) {
      bindRawObjectValue[key] = value[key]
    }

    if (value.hasOwnProperty('prototype')) {
      rawDefineProperty(bindRawObjectValue, 'prototype', {
        value: value.prototype,
        configurable: true,
        enumerable: false,
        writable: true,
      })
    }

    return value[cacheKey] = bindRawObjectValue
  }

  return value
}
