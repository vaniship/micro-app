/* eslint-disable no-cond-assign */
import { CallableFunctionForInteract, AppName } from '@micro-app/types'
import { logError, isFunction, isPlainObject, assign, macro } from '../libs/utils'

export default class EventCenter {
  public eventList = new Map<string, {
    data: Record<PropertyKey, unknown>,
    callbacks: Set<CallableFunctionForInteract>,
  }>()

  // whether the name is legal
  private isLegalName (name: string): boolean {
    if (!name) {
      logError('event-center: Invalid name')
      return false
    }

    return true
  }

  private queue: string[] = []

  // add appName to queue
  private enqueue (name: AppName, nextStep?: CallableFunction): void {
    // Because web framework use micro task to update data, so we use macro task here
    (!this.queue.includes(name) && this.queue.push(name) === 1) && macro(() => {
      this.process()
      nextStep?.()
    }, 1)
  }

  // run task
  private process = (): void => {
    let name: string | void
    while (name = this.queue.shift()) {
      const eventInfo = this.eventList.get(name)!
      for (const f of eventInfo.callbacks) {
        f(eventInfo.data)
      }
    }
  }

  /**
   * add listener
   * @param name event name
   * @param f listener
   * @param autoTrigger If there is cached data when first bind listener, whether it needs to trigger, default is false
   */
  public on (name: string, f: CallableFunctionForInteract, autoTrigger = false): void {
    if (this.isLegalName(name)) {
      if (!isFunction(f)) {
        return logError('event-center: Invalid callback function')
      }

      let eventInfo = this.eventList.get(name)
      if (!eventInfo) {
        eventInfo = {
          data: {},
          callbacks: new Set(),
        }
        this.eventList.set(name, eventInfo)
      } else if (autoTrigger && Object.getOwnPropertyNames(eventInfo.data).length) {
        // auto trigger when data not null
        f(eventInfo.data)
      }

      eventInfo.callbacks.add(f)
    }
  }

  // remove listener, but the data is not cleared
  public off (name: string, f?: CallableFunctionForInteract): void {
    if (this.isLegalName(name)) {
      const eventInfo = this.eventList.get(name)
      if (eventInfo) {
        if (isFunction(f)) {
          eventInfo.callbacks.delete(f)
        } else {
          eventInfo.callbacks.clear()
        }
      }
    }
  }

  // dispatch data
  public dispatch (
    name: string,
    data: Record<PropertyKey, unknown>,
    nextStep?: CallableFunction,
  ): void {
    if (this.isLegalName(name)) {
      if (!isPlainObject(data)) {
        return logError('event-center: data must be object')
      }
      let eventInfo = this.eventList.get(name)
      if (eventInfo) {
        eventInfo.data = assign({}, eventInfo.data, data)
      } else {
        eventInfo = {
          data: data,
          callbacks: new Set(),
        }
        this.eventList.set(name, eventInfo)
      }
      // add to queue, event eventInfo is null
      this.enqueue(name, nextStep)
    }
  }

  // get data
  public getData (name: string): Record<PropertyKey, unknown> | null {
    const eventInfo = this.eventList.get(name)
    return eventInfo?.data ?? null
  }
}
