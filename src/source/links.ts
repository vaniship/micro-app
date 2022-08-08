import type {
  AppInterface,
  LinkSourceInfo,
  AttrsType,
  fiberTasks,
} from '@micro-app/types'
import { fetchSource } from './fetch'
import {
  CompletionPath,
  promiseStream,
  pureCreateElement,
  defer,
  logError,
  getAttributes,
  promiseRequestIdle,
  serialExecFiberTasks,
} from '../libs/utils'
import scopedCSS, { createPrefix } from '../sandbox/scoped_css'
import {
  dispatchOnLoadEvent,
  dispatchOnErrorEvent,
} from './load_event'
import sourceCenter from './source_center'

/**
 * Extract link elements
 * @param link link element
 * @param parent parent element of link
 * @param app app
 * @param microAppHead micro-app-head element
 * @param isDynamic dynamic insert
 */
export function extractLinkFromHtml (
  link: HTMLLinkElement,
  parent: Node,
  app: AppInterface,
  isDynamic = false,
): any {
  const rel = link.getAttribute('rel')
  let href = link.getAttribute('href')
  let replaceComment: Comment | null = null
  if (rel === 'stylesheet' && href) {
    href = CompletionPath(href, app.url)
    let linkInfo = sourceCenter.link.getInfo(href)
    const appSpaceData = {
      attrs: getAttributes(link),
    }
    if (!linkInfo) {
      linkInfo = {
        code: '',
        appSpace: {
          [app.name]: appSpaceData,
        }
      }
    } else {
      linkInfo.appSpace[app.name] = appSpaceData
    }
    if (!isDynamic) {
      app.source.links.add(href)
      sourceCenter.link.setInfo(href, linkInfo)
      replaceComment = document.createComment(`link element with href=${href} move to micro-app-head as style element`)
      linkInfo.appSpace[app.name].placeholder = replaceComment
    } else {
      return { address: href, linkInfo }
    }
  } else if (rel && ['prefetch', 'preload', 'prerender', 'icon', 'apple-touch-icon'].includes(rel)) {
    // preload prefetch icon ....
    if (isDynamic) {
      replaceComment = document.createComment(`link element with rel=${rel}${href ? ' & href=' + href : ''} removed by micro-app`)
    } else {
      parent.removeChild(link)
    }
  } else if (href) {
    // dns-prefetch preconnect modulepreload search ....
    link.setAttribute('href', CompletionPath(href, app.url))
  }

  if (isDynamic) {
    return { replaceComment }
  } else if (replaceComment) {
    return parent.replaceChild(replaceComment, link)
  }
}

/**
 * Get link remote resources
 * @param wrapElement htmlDom
 * @param app app
 * @param microAppHead micro-app-head
 */
export function fetchLinksFromHtml (
  wrapElement: HTMLElement,
  app: AppInterface,
  microAppHead: Element,
  fiberStyleResult: Promise<void> | undefined,
): void {
  const styleList: Array<string> = Array.from(app.source.links)
  const fetchLinkPromise: Array<Promise<string> | string> = styleList.map((address) => {
    const linkInfo = sourceCenter.link.getInfo(address)!
    return linkInfo.code ? linkInfo.code : fetchSource(address, app.name)
  })

  const fiberLinkTasks: fiberTasks = app.isPrefetch || app.fiber ? [] : null

  promiseStream<string>(fetchLinkPromise, (res: { data: string, index: number }) => {
    if (fiberLinkTasks) {
      fiberLinkTasks.push(() => promiseRequestIdle((resolve: PromiseConstructor['resolve']) => {
        fetchLinkSuccess(
          styleList[res.index],
          res.data,
          microAppHead,
          app,
        )
        resolve()
      }))
    } else {
      fetchLinkSuccess(
        styleList[res.index],
        res.data,
        microAppHead,
        app,
      )
    }
  }, (err: {error: Error, index: number}) => {
    logError(err, app.name)
  }, () => {
    if (fiberLinkTasks) {
      /**
       * 1. If fiberLinkTasks is not null, fiberStyleResult is not null
       * 2. Download link source while processing style
       * 3. Process style first, and then process link
       */
      fiberStyleResult!.then(() => {
        fiberLinkTasks.push(() => Promise.resolve(app.onLoad(wrapElement)))
        serialExecFiberTasks(fiberLinkTasks)
      })
    } else {
      app.onLoad(wrapElement)
    }
  })
}

/**
 * Fetch link succeeded, replace placeholder with style tag
 * NOTE:
 * 1. Only exec when init, no longer exec when remount
 * 2. Only handler html link element, not dynamic link or style
 * 3. The same prefix can reuse parsedCode
 * 4. Async exec with requestIdleCallback in prefetch or fiber
 * 5. appSpace[app.name].placeholder/.attrs must exist
 * @param address resource address
 * @param code link source code
 * @param microAppHead micro-app-head
 * @param app app instance
 */
export function fetchLinkSuccess (
  address: string,
  code: string,
  microAppHead: Element,
  app: AppInterface,
): void {
  /**
   * linkInfo must exist, but linkInfo.code not
   * so we set code to linkInfo.code
   */
  const linkInfo = sourceCenter.link.getInfo(address)!
  linkInfo.code = code
  const placeholder = linkInfo.appSpace[app.name].placeholder!
  const convertStyle = pureCreateElement('style')

  handlerConvertStyle(
    app,
    address,
    convertStyle,
    linkInfo,
    linkInfo.appSpace[app.name].attrs,
  )

  if (placeholder.parentNode) {
    placeholder.parentNode.replaceChild(convertStyle, placeholder)
  } else {
    microAppHead.appendChild(convertStyle)
  }

  // clear placeholder
  linkInfo.appSpace[app.name].placeholder = null
}

/**
 * update convertStyle, linkInfo.parseResult
 * @param app app instance
 * @param address resource address
 * @param convertStyle converted style
 * @param linkInfo linkInfo in sourceCenter
 * @param attrs attrs of link
 */
export function handlerConvertStyle (
  app: AppInterface,
  address: string,
  convertStyle: HTMLStyleElement,
  linkInfo: LinkSourceInfo,
  attrs: AttrsType,
): void {
  if (app.scopecss) {
    const prefix = createPrefix(app.name)
    // set __MICRO_APP_LINK_PATH__ before scopedCSS
    convertStyle.__MICRO_APP_LINK_PATH__ = address
    if (!linkInfo.parseResult) {
      convertStyle.textContent = linkInfo.code
      scopedCSS(convertStyle, app)
      linkInfo.parseResult = {
        prefix,
        parsedCode: convertStyle.textContent,
      }
    } else if (linkInfo.parseResult.prefix === prefix) {
      convertStyle.textContent = linkInfo.parseResult.parsedCode
    } else {
      // Attention background, url()
      convertStyle.textContent = linkInfo.parseResult.parsedCode.replaceAll(new RegExp(createPrefix(app.name, true), 'g'), prefix)
      // scopedCSS(convertStyle, app)
    }
  } else {
    convertStyle.textContent = linkInfo.code
  }

  setConvertStyleAttr(convertStyle, attrs)
}

// transfer the attributes on the link to convertStyle
function setConvertStyleAttr (convertStyle: HTMLStyleElement, attrs: AttrsType): void {
  attrs.forEach((value, key) => {
    if (key === 'href') key = 'data-origin-href'
    convertStyle.setAttribute(key, value)
  })
}

/**
 * get css from dynamic link
 * @param address link address
 * @param linkInfo linkInfo
 * @param app app
 * @param originLink origin link element
 * @param convertStyle style element which replaced origin link
 */
export function formatDynamicLink (
  address: string,
  linkInfo: LinkSourceInfo,
  app: AppInterface,
  originLink: HTMLLinkElement,
  convertStyle: HTMLStyleElement,
): void {
  if (linkInfo.code) {
    handlerConvertStyle(
      app,
      address,
      convertStyle,
      linkInfo,
      linkInfo.appSpace[app.name].attrs,
    )
    defer(() => dispatchOnLoadEvent(originLink))
    return
  }

  fetchSource(address, app.name).then((data: string) => {
    linkInfo.code = data
    convertStyle.textContent = data
    if (app.scopecss) {
      scopedCSS(convertStyle, app)
      linkInfo.parseResult = {
        prefix: createPrefix(app.name),
        parsedCode: convertStyle.textContent,
      }
    }
    setConvertStyleAttr(convertStyle, linkInfo.appSpace[app.name].attrs)
    sourceCenter.link.setInfo(address, linkInfo)
    dispatchOnLoadEvent(originLink)
  }).catch((err) => {
    logError(err, app.name)
    dispatchOnErrorEvent(originLink)
  })
}
