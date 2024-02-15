import axios from "axios";

async function runReq() {
  await axios.post('http://localhost:8080/getGamesBetweenPlayers', {
    address: 4,
  })
}

runReq().then()
