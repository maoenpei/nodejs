
echo "$$">pid_daemon
while true
do
  pid=`cat pid`
  psr=`ps -A | grep -e "^${pid} "`
  if [ ! "$psr" ]; then
    dt=`date +%s`
    mv nohup.out logs/nohup_${dt}.out
    nohup node server root /yongzhe port 6117 >nohup.out 2>&1 &
    echo "stopped and resumed! ${dt}"
  else
    lt=`date`
    echo "alive...${lt}"
  fi
  sleep 10
done
