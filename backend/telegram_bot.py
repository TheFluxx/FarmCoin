import logging
from aiogram import Bot, Dispatcher, types
from aiogram.contrib.middlewares.logging import LoggingMiddleware
from aiogram.types import ParseMode, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.utils import executor
from sqlalchemy import create_engine, Column, Integer, String, Boolean, BigInteger, ARRAY
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from aiogram.dispatcher.filters import CommandStart

API_TOKEN = '7246960528:AAEeMj2VS8nnnVHL1U1BoNdW_T4BXFNJvSc'
MINI_APP_URL = 'https://t.me/FarmerTapBot/clicker'

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Настройка подключения к базе данных
DATABASE_URL = 'postgresql://clicker_user:rootroot@localhost:5432/farmclicker'

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
session = Session()
Base = declarative_base()

# Определение модели User
class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, autoincrement=True)
    telegram_id = Column(BigInteger, unique=True)
    telegram_username = Column(String)
    farm_coins = Column(Integer, default=1000000)
    multitap = Column(Integer, default=1)
    able = Column(Integer, default=6500)
    energy = Column(Integer, default=6500)
    autofarm = Column(Boolean, default=False)
    current_skin = Column(String, default='./img/coin-btn.png')
    skins = Column(ARRAY(String), default=['./img/coin-btn.png'])
    tasks_id_done = Column(ARRAY(Integer), default=[])
    referer = Column(BigInteger, nullable=True)

# Создание таблицы (если её нет)
Base.metadata.create_all(engine)

# Инициализация бота и диспетчера
bot = Bot(token=API_TOKEN)
dp = Dispatcher(bot)
dp.middleware.setup(LoggingMiddleware())

# Обработчик команды /start
@dp.message_handler(CommandStart())
async def start_command(message: types.Message):
    telegram_id = message.from_user.id
    telegram_username = message.from_user.username

    # Проверка существования пользователя
    user = session.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        # Создание нового пользователя
        user = User(telegram_id=telegram_id, telegram_username=telegram_username)
        session.add(user)
        session.commit()
        await message.reply(f"Добро пожаловать, {telegram_username}! 🎉 Вы успешно зарегистрированы.")
    else:
        await message.reply(f"Вы уже зарегистрированы, {telegram_username}.")

    # Создание кнопки для перехода в mini app
    keyboard = InlineKeyboardMarkup()
    mini_app_button = InlineKeyboardButton(text="Перейти в mini app 🚀", url=MINI_APP_URL)
    keyboard.add(mini_app_button)

    welcome_text = (
        f"Привет, {telegram_username}! 👋\n"
        "Добро пожаловать в Farmer Tap! 🌾\n"
        "Нажмите на кнопку ниже, чтобы войти в наш mini app и начать играть! 🎮"
    )

    await message.answer(welcome_text, reply_markup=keyboard)

if __name__ == '__main__':
    executor.start_polling(dp, skip_updates=True)