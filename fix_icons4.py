import re

files = [
    'src/pages/Contacts/Contacts.jsx',
    'src/pages/Chat/Chat.jsx',
    'src/pages/Connections/Connections.jsx',
    'src/pages/MassMessage/MassMessage.jsx'
]

mapping = {
    'Tag': 'Label',
    'Paperclip': 'Attachment',
    'BrainCircuit': 'Algorithm'
}

for file in files:
    try:
        with open(file, 'r') as f:
            content = f.read()
            
        # Replace occurrences of word matches
        for k, v in mapping.items():
            content = re.sub(r'\b' + k + r'\b', v, content)
            
        with open(file, 'w') as f:
            f.write(content)
    except FileNotFoundError:
        pass
print("Fixed remaining missing icons completely")
