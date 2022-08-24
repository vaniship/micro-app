<template>
  <div id="app">
    <div class='tab-con'>
      <el-tabs v-model="activeName" @tab-click="handleClick">
        <el-tab-pane label="home" name="/"></el-tab-pane>
        <el-tab-pane label="page2" name="page2"></el-tab-pane>
      </el-tabs>
    </div>
    <div @click="reload">点击刷新</div>
    <!-- <keep-alive> -->
      <router-view v-if="showView"></router-view>
    <!-- </keep-alive> -->
  </div>
</template>

<script>

export default {
  name: 'App',
  data () {
    return {
      activeName: location.href.includes('#/page2') ? 'page2': '/',
      showView: true,
    }
  },
  mounted () {
    window.addEventListener('popstate', () => {
      this.activeName =location.href.includes('#/page2') ? 'page2': '/'
    })
  },
  components: {

  },
  methods: {
    handleClick(tab) {
      this.$router.push(tab.name)
    },
    reload () {
      this.showView = false
      this.$nextTick(() => {
        this.showView = true
      })
    }
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  background: #fff;
  width: 100%;
  padding: 30px;
  box-sizing: border-box;
}

.icon {
  width: 1em;
  height: 1em;
  vertical-align: -0.15em;
  fill: currentColor;
  overflow: hidden;
}
</style>
