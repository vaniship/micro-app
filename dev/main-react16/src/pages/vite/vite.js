/** @jsxRuntime classic */
/** @jsx jsxCustomEvent */
import jsxCustomEvent from '@micro-zoe/micro-app/polyfill/jsx-custom-event'
import { useState } from 'react'
import { Button, Spin, Col } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'
import { EventCenterForMicroApp } from '@micro-zoe/micro-app'
import config from '../../config'
import './vite.less'
import microApp from '@micro-zoe/micro-app'

// 注册子应用vite的数据通信对象
window.eventCenterForVite = new EventCenterForMicroApp('vite')

const antIcon = <LoadingOutlined style={{ fontSize: 30 }} spin />

function vite () {
  const [data, changeData] = useState({from: '来自基座的初始化数据'})
  const [showLoading, hideLoading] = useState(true)

  function handleMounted () {
    hideLoading(false)
    console.log('生命周期: vite 渲染完成了')
  }

  function handleDataChange (e) {
    console.log('来自 vite 子应用的数据', e.detail.data)
  }

  function jumpToPage2 () {
    microApp.router.push({name: 'vite', path: '/micro-app/vite/#/page2'})
  }

  return (
    <div>
      <div className='btn-con'>
        <Col span={6} className='btn-con'>
          <Button
            type='primary'
            onClick={() => changeData({from: '来自基座的数据' + (+new Date())})}
            style={{width: '120px'}}
          >
            发送数据
          </Button>
          <Button type="primary" onClick={jumpToPage2}>控制子应用跳转page2</Button>
        </Col>
      </div>
      {
        showLoading && <Spin indicator={antIcon} />
      }
      <micro-app
        name='vite'
        url={`${config.vite}micro-app/vite/`}
        // url={`http://127.0.0.1:8080/micro-app/vite/`}
        data={data}
        // onBeforemount={() => hideLoading(false)}
        onMounted={handleMounted}
        onDataChange={handleDataChange}
        // destroy
        inline
        disableSandbox
      >
      </micro-app>
    </div>
  )
}

export default vite
