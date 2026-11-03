from getpass import getpass

from sqlalchemy import delete
from sqlmodel import Session, select

from accounts import LoginSession, User, hash_password
from main import engine

MEMBERS = [
    '1089229@students.adu.ac.ae',
    '1075919@students.adu.ac.ae',
    '1082602@students.adu.ac.ae',
]


def main():
    with Session(engine) as session:
        users = [session.exec(select(User).where(User.email == email)).first() for email in MEMBERS]
        if any(user is None for user in users):
            raise SystemExit('Run database/profiles_friends.sql before setting passwords.')
        for user in users:
            print(f'Account: {user.name} ({user.email})')
            if user.password_hash:
                print('Password already set. Skipping.')
                continue
            while True:
                password = getpass('Choose a password (at least 12 characters): ')
                confirmation = getpass('Confirm password: ')
                if len(password) < 12:
                    print('Use at least 12 characters.')
                elif password != confirmation:
                    print('Passwords do not match.')
                else:
                    break
            user.password_hash = hash_password(password)
            session.add(user)
            session.exec(delete(LoginSession).where(LoginSession.user_id == user.id))
            session.commit()
            print('Password saved.')


if __name__ == '__main__':
    main()
