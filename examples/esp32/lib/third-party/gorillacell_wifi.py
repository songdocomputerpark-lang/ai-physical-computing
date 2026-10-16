from machine import Pin
from machine import UART
from time import sleep_ms

class GORILLACELL_WIFI:
    def __init__(self, port=2, baud=115200, tx=26, rx=25):
        self._wifi = UART(port, baudrate=baud, tx=tx, rx=rx)
        
    def sta_init(self, ssid, pwd):
        self.write('AT+CWMODE=1')
        while(1):
            response = str(self.decode())
            if response != "...":
                print(response)
            if "OK" in response:
                break

        self.write('AT+CWJAP="{}","{}"'.format(ssid,pwd))
        is_to_check_OK = 0
        while(1):
            response = str(self.decode())
            if response != "...":
                print(response)
            if "WIFI GOT IP" in response:
                is_to_check_OK = 1
            if is_to_check_OK:
                if "OK" in response:
                    break

    def ap_init(self, ssid, pwd):
        self.write('AT+CWMODE=2')
        while(1):
            response = str(self.decode())
            if response != "...":
                print(response)
            if "OK" in response:
                break

        self.write('AT+CWSAP="{}","{}",5,3'.format(ssid,pwd))
        while(1):
            response = str(self.decode())
            if response != "...":
                print(response)
            if "OK" in response:
                break
            
    def server(self, cwmode):
        self.cipmux(mode=1)
        while(1):
            response = str(self.decode())
            if response != "...":
                print(response)
            if "OK" in response:
                break

        self.cipserver(mode=1,port=80)
        while(1):
            response = str(self.decode())
            if response != "...":
                print(response)
            if "OK" in response:
                break

        self.cifsr()
        while(1):
            response = str(self.decode())
            if response != "...":
                print(response)
            if cwmode == 1:
                if "STAIP" in response:
                    break
            elif cwmode == 2:
                if "APIP" in response:
                    break
                
    def display(self,ids,html):
        self.write('AT+CIPSEND={},{}'.format(ids,len(html))) 
        while(1):
            response = str(self.decode())
            if response != "...":
                print(response)
            if ">" in response:
                break
            if "ERROR" in response:
                self.write('AT+CIPSEND={},{}'.format(ids,len(html))) 

        self.write(html)
        while(1):
            response = str(self.decode())
            if response != "...":
                print(response)
            if "OK" in response:
                break

        self.write('AT+CIPCLOSE=1')
        while(1):
            response = str(self.decode())
            if response != "...":
                print(response)
            if "OK" in response:
                break
            
    def parsed(self):
        '''
        PSEUDO CODE:
            * Get each payload line by line, we are only
            * interested in a line with IPD
            * If +IPD is found, parse the important parts of the string
            *    ipd is the +IPD string
            *    ids is the ID of the connected client
            *    req is the remaining part which will be further dissected
            *    cnt is the number of receive characters
            *    get is the remaining part which will be further dissected again
            *    page is the requested html page by the client
        '''
        request = self.decode_line()
        ids = ""
        page = ""
        if request != "...":
            print(request)
        if "+IPD," in request:
            ipd,ids,req = request.split(",")
            print(ipd, ids, req)
            cnt,get = req.split(":")
            print(cnt, get)
            page = get[4:-10]
            print(page)
        return ids, page
        
    def write(self, tx_data):
        self._wifi.write('{}\r\n'.format(tx_data))
        
    def read(self):
        timeout = 1000
        test_ret = "..."
        while self._wifi.any()==0:
            if timeout == 0:
                return bytes(test_ret, 'utf-8')
            else:
                timeout -= 1
        reply = self._wifi.read()
        return reply

    def readline(self):
        timeout = 1000
        test_ret = "..."
        while self._wifi.any()==0:
            if timeout == 0:
                return bytes(test_ret, 'utf-8')
            else:
                timeout -= 1
        reply = self._wifi.readline()
        return reply
    
    def decode(self):
        reply = self.read()
        return reply.decode()
    
    def decode_line(self):
        reply = self.readline()
        return reply.decode()
    
    def prints(self):
        print(self.decode())
        
    def echo(self, mode='None'):
        if mode==0:
            self.write('ATE0')
        else: #mode==1
            self.write('ATE1')
            
    def cwmode(self, mode='None'):
        if   mode==1: # Station mode
            self.write('AT+CWMODE=1')
        elif mode==2: # AP mode
            self.write('AT+CWMODE=2')
        elif mode==3: # STA and AP mode
            self.write('AT+CWMODE=3')
        else:
            self.write('AT+CWMODE?')
        
    def cifsr(self):
        self.write('AT+CIFSR')
        
    def cipmux(self,mode='None'):
        if mode==1:
            self.write('AT+CIPMUX=1')
        else:
            self.write('AT+CIPMUX?')
      
    def cipserver(self,mode='None',port='None'):
        sleep_ms(50)
        self.write('AT+CIPSERVER={},{}'.format(mode,port))
