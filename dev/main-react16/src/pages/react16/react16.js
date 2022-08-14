/** @jsxRuntime classic */
/** @jsx jsxCustomEvent */
import jsxCustomEvent from '@micro-zoe/micro-app/polyfill/jsx-custom-event'
import React from 'react'
import { Spin, Row, Col, Button, Modal } from 'antd'
import { LoadingOutlined } from '@ant-design/icons';
import microApp, { unmountApp, unmountAllApps } from '@micro-zoe/micro-app'
import config from '../../config'
import './react16.less'

const antIcon = <LoadingOutlined style={{ fontSize: 30 }} spin />

export default class App extends React.Component {
  state = {
    data: {
      name: '初始化数据'
    },
    name: 'react#16',
    url: `${config.react16}micro-app/react16/?a=1`,
    // url: 'http://127.0.0.1:8080/micro-app/react16',
    showLoading: true,
    showMicroApp: true,
    testNum: 0,
    modal1: false,
  }

  handleCreated = () => {
    console.log(`生命周期：created -- ${this.state.name}`)
  }

  beforemount = (e) => {
    console.log(`生命周期：beforemount -- ${this.state.name}`, e)
  }

  mounted = () => {
    console.timeEnd(`mounted-${this.state.name}`)
    console.log(`生命周期：mounted -- ${this.state.name}`, document.querySelector('micro-app'))
    this.setState({
      showLoading: false
    })
  }

  unmount = () => {
    console.log(`生命周期：unmount -- ${this.state.name}`, document.querySelector('#micro-app-template-style'))
  }

  error = (e) => {
    console.log(`生命周期：error -- ${this.state.name}`, e)
  }

  handleBeforeshow = (e) => {
    console.log(`生命周期：keep-alive beforeshow -- ${this.state.name}`, e)
  }

  handleAftershow = (e) => {
    console.timeEnd(`mounted-${this.state.name}`)
    console.log(`生命周期：keep-alive aftershow -- ${this.state.name}`, document.querySelector('micro-app'))
    this.setState({
      showLoading: false
    })
  }

  handleAfterhidden = (e) => {
    console.log(`生命周期：keep-alive afterhidden -- ${this.state.name}`, e)
  }

  changeData = () => {
    this.setState({
      data: {
        name: +new Date(),
      },
    })
  }

  dispatchData = () => {
    microApp.setData(this.state.name, {dispatch: 'data from dispatch' + (+new Date())})
  }

  dispatchGlobalData = () => {
    microApp.setGlobalData({name: '全局数据' + (+new Date())})
  }

  handleDataChange = (e) => {
    console.log('通过生命周周期监听到来自子应用的数据', e)
    Modal.info({
      title: '来自子应用的数据',
      content: (
        <div>
          <p>{JSON.stringify(e.detail.data)}</p>
        </div>
      ),
      onOk() {},
    });
  }

  toggleShow = () => {
    this.setState({
      showMicroApp: !this.state.showMicroApp,
    })
  }

  changeNameUrl = () => {
    this.setState({
      name: 'react16',
      url: `${config.react16}micro-app/react16/?a=2`,
    })
  }

  handleModal = () => {
    this.setState({
      modal1: !this.state.modal1,
    })
  }

  // 主动卸载应用
  handleUnmountMySelf = () => {
    // unmountApp 会删除micro-app元素
    // 当先通过unmountApp卸载应用后再通过setState控制元素展示，会导致react报错，因为micro-app元素已经不存在了
    // 此处先通过setState控制应用卸载，再通过unmountApp删除缓存状态，避免报错
    this.setState({
      showMicroApp: false,
    }, () => {
      unmountApp(this.state.name, {
        // destroy: true,
        clearAliveState: true,
      }).then(() => {
        console.log('unmountApp方法 -- 卸载成功')
      })
    })
  }

  changeTestNum = () => {
    this.setState({
      testNum: this.state.testNum + 1,
    })
    console.log(33333, this.props.history)
  }

  jumpToHome = () => {
    microApp.router.push({name: this.state.name, path: '/micro-app/react16/'})
  }

  jumpToPage2 = () => {
    microApp.router.push({name: this.state.name, path: '/micro-app/react16/page2'})
  }

  jumpToInline = () => {
    microApp.router.push({name: this.state.name, path: '/micro-app/react16/inline'})
  }

  useRouterGo = () => {
    microApp.router.go(-1)
  }

  useRouterBack = () => {
    microApp.router.back()
  }

  useRouterForward = () => {
    microApp.router.forward()
  }

  useCurrentRoute = () => {
    console.log('router.current', microApp.router.current.get('react16'))

    // setTimeout(() => {
    //   microApp.router.current.get('react16').assign('?b=222')
    // }, 3000);
  }

  useRouterAttachToURL = () => {
    microApp.router.attachToURL(this.state.name)
  }

  useRouterAttachAllToURL = () => {
    microApp.router.attachAllToURL()
  }

  handleGlobalDataForBaseApp = (data) => {
    console.log(`这是全局数据--基座应用-${this.state.name}`, data)
  }

  componentDidMount () {
    console.time(`mounted-${this.state.name}`)
    console.time(this.state.name)

    microApp.addDataListener(this.state.name, (data) => {
      console.log('来自子应用react16的数据', data)
    })

    microApp.addGlobalDataListener(this.handleGlobalDataForBaseApp)

    // this.releaseBeforeEach1 = microApp.router.beforeEach((to, from, appName) => {
    //   // const a = document.createElement('div')
    //   // a.innerHTML = '44444444'
    //   // document.body.appendChild(a)
    //   console.log('全局 beforeEach: ', to, from, appName)
    // })

    // this.releaseBeforeEach2 = microApp.router.beforeEach({
    //   react16 (to, from) {
    //     console.log('指定 beforeEach: ', to, from)
    //   }
    // })

    // this.releaseAfterEach1 = microApp.router.afterEach((to, from, appName) => {
    //   console.log('全局 afterEach: ', to, from, appName)
    // })

    // this.releaseAfterEach2 = microApp.router.afterEach({
    //   react16 (to, from) {
    //     console.log('指定 afterEach: ', to, from)
    //   }
    // })

    microApp.router.setBaseAppRouter(this.props.history)
  }

  componentWillUnmount ()  {
    microApp.clearDataListener(this.state.name)
    microApp.removeGlobalDataListener(this.handleGlobalDataForBaseApp)
    this.releaseBeforeEach1?.()
    this.releaseBeforeEach2?.()
    this.releaseAfterEach1?.()
    this.releaseAfterEach2?.()
  }

  render () {
    return (
      <>
        <Row className='react16'>
          <Col span={6} className='btn-con'>
            <Button type="primary" onClick={this.toggleShow}>微应用是否展示</Button>
            <Button type="primary" onClick={this.changeData}>data属性发送数据</Button>
            <Button type="primary" onClick={this.dispatchData}>dispatch方法发送数据</Button>
            <Button type="primary" onClick={this.dispatchGlobalData}>发送全局数据</Button>
            <Button type="primary" onClick={this.changeNameUrl}>切换应用</Button>
            <Button type="primary" onClick={this.handleModal}>modal内嵌应用</Button>
            <Button type="primary" onClick={this.handleUnmountMySelf}>主动卸载应用</Button>
            <Button type="primary" onClick={this.jumpToHome}>基座控制子应用跳转home</Button>
            <Button type="primary" onClick={this.jumpToPage2}>基座控制子应用跳转page2</Button>
            <Button type="primary" onClick={this.jumpToInline}>基座控制子应用跳转inline</Button>
            <Button type="primary" onClick={this.useRouterGo}>基座调用router.go</Button>
            <Button type="primary" onClick={this.useRouterBack}>基座调用router.back</Button>
            <Button type="primary" onClick={this.useRouterForward}>基座调用router.forward</Button>
            <Button type="primary" onClick={this.useCurrentRoute}>基座调用router.current</Button>
            <Button type="primary" onClick={this.useRouterAttachToURL}>基座调用router.attachToURL</Button>
            <Button type="primary" onClick={this.useRouterAttachAllToURL}>基座调用router.attachAllToURL</Button>
            <Button type="primary" onClick={this.changeTestNum}>{this.state.testNum}</Button>
          </Col>
          <Col span={18} className='app-con-react16'>
            { this.state.showLoading && <Spin indicator={antIcon} /> }
            { !this.state.showLoading && <h3>微应用{this.state.name}</h3> }
            {
              this.state.showMicroApp && (
                <micro-app
                  name={this.state.name}
                  url={this.state.url}
                  data={this.state.data}
                  onCreated={this.handleCreated}
                  onBeforemount={this.beforemount}
                  onMounted={this.mounted}
                  onUnmount={this.unmount}
                  onError={this.error}
                  onBeforeshow={this.handleBeforeshow}
                  onAftershow={this.handleAftershow}
                  onAfterhidden={this.handleAfterhidden}
                  onDataChange={this.handleDataChange}
                  baseRoute='/micro-app/demo/react16'
                  // keep-alive
                  // destroy
                  // inline
                  // disableSandbox
                  // disable-sandbox
                  // disableScopecss
                  // disable-scopecss
                  // shadowDOM
                  // disable-memory-router
                  keep-router-state
                  // default-page='/micro-app/react16/page2'
                  // hidden-router
                  // disable-patch-request
                  // esmodule
                  // fiber
                >
                </micro-app>
              )
            }
            {/* <iframe src={this.state.url} onLoad={this.mounted} width='700' height='700'></iframe> */}
            <Modal
              visible={this.state.modal1}
              maskClosable={true}
              title="Title"
              width={500}
              height={500}
              destroyOnClose
              onOk={() => this.setState({modal1: false})}
              onCancel={() => this.setState({modal1: false})}
            >
              <micro-app
                name='modal-app1'
                url={this.state.url}
                // baseRoute='/micro-app/demo/react16'
                // disableSandbox
                // macro
              />
            </Modal>
          </Col>
        </Row>
      </>
    )
  }
}
