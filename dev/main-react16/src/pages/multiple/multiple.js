/** @jsxRuntime classic */
/** @jsx jsxCustomEvent */
import jsxCustomEvent from '@micro-zoe/micro-app/polyfill/jsx-custom-event'
import { useState, useEffect } from 'react'
import { Button, Spin, Col } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'
import config from '../../config'
import './multiple.less'
import microApp from '@micro-zoe/micro-app'

const antIcon = <LoadingOutlined style={{ fontSize: 30 }} spin />

function Vue3 () {
  const [data, changeData] = useState({from: '来自基座的初始化数据'})
  const [reactChildName, changename] = useState('react162')
  const [showLoading, hideLoading] = useState(true)

  useEffect(() => {
    console.time('react16')
  }, [])

  function jumpToReactHome () {
    microApp.router.push({name: reactChildName, path: '/micro-app/react16/'})
  }

  function jumpToReactPage2 () {
    microApp.router.push({name: reactChildName, path: '/micro-app/react16/page2'})
  }

  function jumpToReactInline () {
    microApp.router.push({name: reactChildName, path: '/micro-app/react16/inline'})
  }

  function jumpToVueHome () {
    microApp.router.push({name: 'vue22', path: '/micro-app/vue2/#/'})
  }

  function jumpToVuePage2 () {
    microApp.router.push({name: 'vue22', path: '/micro-app/vue2/#/page2'})
  }

  function jumpToVueTable () {
    microApp.router.push({name: 'vue22', path: '/micro-app/vue2/#/table'})
  }

  return (
    <div>
      <div className='multiple-btn-con'>
      <Col span={6} className='btn-con'>
        <Button
          type='primary'
          onClick={() => changeData({from: '来自基座的数据' + (+new Date())})}
          style={{width: '120px'}}
        >
          发送数据
        </Button>
        <Button type="primary" onClick={() => changename('react163')}>改变react16的name</Button>
        <Button type="primary" onClick={jumpToReactHome}>基座控制React子应用跳转home</Button>
        <Button type="primary" onClick={jumpToReactPage2}>基座控制React子应用跳转page2</Button>
        <Button type="primary" onClick={jumpToReactInline}>基座控制React子应用跳转inline</Button>
        <Button type="primary" onClick={jumpToVueHome}>基座控制Vue子应用跳转home</Button>
        <Button type="primary" onClick={jumpToVuePage2}>基座控制Vue子应用跳转page2</Button>
        <Button type="primary" onClick={jumpToVueTable}>基座控制Vue子应用跳转table</Button>
      </Col>
      </div>
      {
        showLoading && <Spin indicator={antIcon} />
      }
      <div className='multiple-con'>
        <micro-app
          class='multiple-micro-app'
          name={reactChildName}
          url={`${config.react16}micro-app/react16`}
          data={data}
          // baseRoute='/micro-app/demo/multiple'
          onMounted={() => hideLoading(false)}
          // destroy
          // inline
          // scopecss='false'
        ></micro-app>
        <micro-app
          class='multiple-micro-app'
          name='vue22'
          url={`${config.vue2}micro-app/vue2`}
          data={data}
          // destroy
          // inline
          // scopecss='false'
        >
        </micro-app>
      </div>
    </div>
  )
}

export default Vue3
