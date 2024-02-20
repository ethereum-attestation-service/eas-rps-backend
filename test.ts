import axios from "axios";

async function runReq() {
  await axios.post('http://localhost:8080/api/checkForBadges', {
    address: '0xD04d9F44244929205cC4d1D9F21c96205DfD272B',
  })
}

runReq()
