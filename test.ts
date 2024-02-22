import axios from "axios";

async function runReq() {
  let i = 0
  while (i<100) {
    axios.post('http://localhost:8080/api/revealMany', {
      reveals: [
        {
          uid: "0x7b9799290cf09a177d891765888d1310df254bbff0d5104391d1d426b4192910",
          choice: 2,
          salt: "0xdfdd595dbe35e1b9831c8a7be2b0beb5f6f4f7157a74e6882ef11b38a603415d"
        }
      ],
    });
    i++
    console.log('ran')
  }
}

runReq()
