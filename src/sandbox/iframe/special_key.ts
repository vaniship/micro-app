export const escape2RawWindowKeys = [
  'getComputedStyle',
  'visualViewport',
  'matchMedia',
  // 'DOMParser',
  'ResizeObserver',
  'IntersectionObserver',
  // 'dispatchEvent',
]

export const escape2RawWindowRegExpKeys = [
  /animationFrame$/i,
  /mutationObserver$/i,
  /height$|width$/i,
  /offset$/i,
  /selection$/i,
  /^range/i,
  /^screen/i,
  /^scroll/i,
  /X$|Y$/,
]

export const uniqueDocumentElement = [
  'body',
  'head',
  'html',
  'title',
]

export const hijackMicroLocationKeys = [
  'host',
  'hostname',
  'port',
  'protocol',
  'origin',
]

export const hijackInstanceOfWindowRegExpKeys = [
  /^((HTML|SVG)\w*|MathML)?Element$/,
  /^(Node|Text|Attr|Comment|EventTarget|CharacterData|NamedNodeMap|ShadowRoot)$/,
  /^Document(Type|Fragment)?$/,
  /^(?!PopState).*Event$/,
  /^DataTransfer/
]

// 有shadowRoot则代理到shadowRoot否则代理到原生document上 (属性)
export const proxy2RawDocOrShadowKeys = [
  'childElementCount',
  'children',
  'firstElementChild',
  'firstChild',
  'lastElementChild',
  'activeElement', // not for Element, but for document/shadowRoot
  'fullscreenElement', // not for Element, but for document/shadowRoot
  'pictureInPictureElement', // not for Element, but for document/shadowRoot
  'pointerLockElement', // not for Element, but for document/shadowRoot
  'styleSheets', // not for Element, but for document/shadowRoot
]

// 有shadowRoot则代理到shadowRoot否则代理到原生document上 (方法)
export const proxy2RawDocOrShadowMethods = [
  'append',
  'contains',
  'replaceChildren',
  'createRange', // not for Element, but for document/shadowRoot
  'getSelection', // not for Element, but for document/shadowRoot
  'elementFromPoint', // not for Element, but for document/shadowRoot
  'elementsFromPoint', // not for Element, but for document/shadowRoot
  'getAnimations', // not for Element, but for document/shadowRoot
]

// 直接代理到原生document上 (属性)
export const proxy2RawDocumentKeys = [
  'characterSet',
  'compatMode',
  'contentType',
  'designMode',
  'dir',
  'doctype',
  'embeds',
  'fullscreenEnabled',
  'hidden',
  'implementation',
  'lastModified',
  'pictureInPictureEnabled',
  'plugins',
  'readyState',
  'referrer',
  'visibilityState',
  'fonts',
]

// 直接代理到原生document上 (方法)
export const proxy2RawDocumentMethods = [
  'execCommand',
  'createRange',
  'exitFullscreen',
  'exitPictureInPicture',
  'getElementsByTagNameNS',
  'hasFocus',
  'prepend',
  // 'dispatchEvent',
]
