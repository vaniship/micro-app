<template>
  <div>
    <router-view></router-view>
    <div id="test-innerHTML"></div>
  </div>
</template>

<script>

export default {
  name: 'App',
  mounted () {
    document.getElementById('test-innerHTML').innerHTML = '<span>3333333333</span>'
  },
}
</script>

<style>
#vite-app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
