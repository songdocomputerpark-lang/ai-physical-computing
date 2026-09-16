from collections import deque
'''
deq1=deque([1,2,3])
deq1.append(4)

print(deq1)

deq2=deque([1,2,3])
deq2.appendleft(0)

print(deq2)

deq3=deque([1,2,3])
deq3_last=deq3.pop()

print(deq3_last)
print(deq3)

deq4=deque([1,2,3])
deq4_first=deq4.popleft()
print(deq4_first)
print(deq4)
'''

deq5=deque(maxlen=3)

for i in range(5):
    deq5.append(i)
    print(deq5)